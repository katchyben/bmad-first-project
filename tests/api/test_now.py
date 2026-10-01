"""One aware-UTC `now` per request, read from the injected Clock."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta, timezone
from typing import Annotated, Any
from zoneinfo import ZoneInfo

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from bmad_first_project.adapters.http.dependencies import get_now
from bmad_first_project.main import create_app

FIXED = datetime(2026, 10, 1, 12, 30, 45, 123456, tzinfo=UTC)

MakeApp = Callable[[], FastAPI]


def _app_with_probe(make_app: MakeApp) -> FastAPI:
    app = make_app()

    def sub_dependency(now: Annotated[datetime, Depends(get_now)]) -> datetime:
        return now

    @app.get("/_test/now")
    def probe(
        now: Annotated[datetime, Depends(get_now)],
        sub_now: Annotated[datetime, Depends(sub_dependency)],
    ) -> dict[str, str]:
        return {"now": now.isoformat(), "sub_now": sub_now.isoformat()}

    return app


def test_now_is_read_once_per_request_and_shared(
    make_app: MakeApp, fake_clock: Any
) -> None:
    fake_clock.value = FIXED
    clock = fake_clock
    client = TestClient(_app_with_probe(make_app))

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
def test_non_utc_clock_value_fails_the_request(
    make_app: MakeApp, fake_clock: Any, value: datetime
) -> None:
    fake_clock.value = value
    client = TestClient(_app_with_probe(make_app))

    with pytest.raises(RuntimeError, match="aware UTC"):
        client.get("/_test/now")


def test_default_app_uses_system_clock(migrated_engine: Any) -> None:
    from bmad_first_project.adapters.clock import SystemClock

    app = create_app(engine=migrated_engine)

    assert isinstance(app.state.clock, SystemClock)


def test_zero_offset_non_utc_zone_is_normalised_to_utc(
    make_app: MakeApp, fake_clock: Any
) -> None:
    london_winter = datetime(2026, 1, 15, 9, 0, tzinfo=ZoneInfo("Europe/London"))
    fake_clock.value = london_winter
    seen: list[datetime] = []
    app = make_app()

    @app.get("/_test/tz")
    def probe(now: Annotated[datetime, Depends(get_now)]) -> None:
        seen.append(now)

    assert TestClient(app).get("/_test/tz").status_code == 200
    assert seen[0].tzinfo is UTC
    assert seen[0] == london_winter


def test_openapi_is_served(make_app: MakeApp) -> None:
    assert TestClient(make_app()).get("/openapi.json").status_code == 200
