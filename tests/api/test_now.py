"""One aware-UTC `now` per request, read from the injected Clock."""

from datetime import UTC, datetime, timedelta, timezone
from typing import Annotated
from zoneinfo import ZoneInfo

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from bmad_first_project.adapters.http.dependencies import get_now
from bmad_first_project.main import create_app

FIXED = datetime(2026, 10, 1, 12, 30, 45, 123456, tzinfo=UTC)


class FakeClock:
    def __init__(self, value: datetime) -> None:
        self.value = value
        self.calls = 0

    def now(self) -> datetime:
        self.calls += 1
        return self.value


def _app_with_probe(clock: FakeClock) -> FastAPI:
    app = create_app(clock=clock)

    def sub_dependency(now: Annotated[datetime, Depends(get_now)]) -> datetime:
        return now

    @app.get("/_test/now")
    def probe(
        now: Annotated[datetime, Depends(get_now)],
        sub_now: Annotated[datetime, Depends(sub_dependency)],
    ) -> dict[str, str]:
        return {"now": now.isoformat(), "sub_now": sub_now.isoformat()}

    return app


def test_now_is_read_once_per_request_and_shared() -> None:
    clock = FakeClock(FIXED)
    client = TestClient(_app_with_probe(clock))

    response = client.get("/_test/now")

    assert response.status_code == 200
    assert clock.calls == 1
    body = response.json()
    assert body["now"] == body["sub_now"] == FIXED.isoformat()
    assert datetime.fromisoformat(body["now"]).utcoffset() == timedelta(0)

    client.get("/_test/now")
    assert clock.calls == 2


@pytest.mark.parametrize(
    "value",
    [
        pytest.param(datetime(2026, 10, 1, 12, 0), id="naive"),  # noqa: DTZ001
        pytest.param(
            datetime(2026, 10, 1, 12, 0, tzinfo=timezone(timedelta(hours=2))),
            id="non-utc-offset",
        ),
    ],
)
def test_non_utc_clock_value_fails_the_request(value: datetime) -> None:
    clock = FakeClock(value)
    client = TestClient(_app_with_probe(clock))

    with pytest.raises(RuntimeError, match="aware UTC"):
        client.get("/_test/now")


def test_default_app_uses_system_clock() -> None:
    from bmad_first_project.adapters.clock import SystemClock

    assert isinstance(create_app().state.clock, SystemClock)


def test_zero_offset_non_utc_zone_is_normalised_to_utc() -> None:
    london_winter = datetime(2026, 1, 15, 9, 0, tzinfo=ZoneInfo("Europe/London"))
    seen: list[datetime] = []
    app = create_app(clock=FakeClock(london_winter))

    @app.get("/_test/tz")
    def probe(now: Annotated[datetime, Depends(get_now)]) -> None:
        seen.append(now)

    assert TestClient(app).get("/_test/tz").status_code == 200
    assert seen[0].tzinfo is UTC
    assert seen[0] == london_winter


def test_openapi_is_served() -> None:
    assert TestClient(create_app()).get("/openapi.json").status_code == 200
