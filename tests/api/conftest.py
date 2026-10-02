"""Shared API fixtures: an app with the account already created, and a client."""

from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from tests.api.helpers import FIXED_NOW, create_account


@pytest.fixture
def app(
    make_app: Callable[[], FastAPI], migrated_engine: Engine, fake_clock: Any
) -> FastAPI:
    """The app on a fixed clock, with the account already created."""
    fake_clock.value = FIXED_NOW
    create_account(migrated_engine)
    return make_app()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client
