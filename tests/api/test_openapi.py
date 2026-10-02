"""The OpenAPI schema publishes the error envelope and stable operation IDs."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

MakeApp = Callable[[], FastAPI]


def _app_with_route(make_app: MakeApp) -> FastAPI:
    app = make_app()

    @app.get("/_test/things/{thing_id}")
    def get_thing(thing_id: int) -> dict[str, int]:
        return {"id": thing_id}

    return app


def _schema(app: FastAPI) -> dict[str, Any]:
    response = TestClient(app).get("/openapi.json")
    assert response.status_code == 200
    return response.json()


def test_app_publishes_error_schemas(make_app: MakeApp) -> None:
    schemas = _schema(make_app())["components"]["schemas"]

    assert {"ErrorResponse", "ErrorBody"} <= set(schemas)
    assert schemas["ErrorResponse"]["properties"]["error"] == {
        "$ref": "#/components/schemas/ErrorBody"
    }


def test_reason_is_optional_and_never_null(make_app: MakeApp) -> None:
    body = _schema(make_app())["components"]["schemas"]["ErrorBody"]

    assert body["required"] == ["code", "message"]
    assert body["properties"]["reason"] == {"type": "string", "title": "Reason"}


def test_error_schemas_match_what_routes_generate(make_app: MakeApp) -> None:
    bare = _schema(make_app())["components"]["schemas"]
    routed = _schema(_app_with_route(make_app))["components"]["schemas"]

    assert routed["ErrorResponse"] == bare["ErrorResponse"]
    assert routed["ErrorBody"] == bare["ErrorBody"]


def test_route_422_is_error_response_with_function_name_operation_id(
    make_app: MakeApp,
) -> None:
    schema = _schema(_app_with_route(make_app))
    operation = schema["paths"]["/_test/things/{thing_id}"]["get"]

    assert operation["operationId"] == "get_thing"
    assert operation["responses"]["422"]["content"]["application/json"] == {
        "schema": {"$ref": "#/components/schemas/ErrorResponse"}
    }
    assert "HTTPValidationError" not in schema["components"]["schemas"]
    assert "ValidationError" not in schema["components"]["schemas"]


def test_schema_is_built_once_and_cached(make_app: MakeApp) -> None:
    app = make_app()

    assert app.openapi() is app.openapi()


def test_included_router_routes_inherit_the_contract(make_app: MakeApp) -> None:
    router = APIRouter(prefix="/api/things")

    @router.post("/{thing_id}/archive")
    def archive_thing(thing_id: int) -> dict[str, int]:
        return {"id": thing_id}

    app = make_app()
    app.include_router(router)
    operation = _schema(app)["paths"]["/api/things/{thing_id}/archive"]["post"]

    assert operation["operationId"] == "archive_thing"
    assert operation["responses"]["422"]["content"]["application/json"] == {
        "schema": {"$ref": "#/components/schemas/ErrorResponse"}
    }


def duplicate_operation_ids(schema: dict[str, Any]) -> list[str]:
    """Every operation ID used by more than one operation, sorted."""
    seen: dict[str, int] = {}
    for path_item in schema["paths"].values():
        for operation in path_item.values():
            if isinstance(operation, dict) and "operationId" in operation:
                seen[operation["operationId"]] = (
                    seen.get(operation["operationId"], 0) + 1
                )
    return sorted(op_id for op_id, count in seen.items() if count > 1)


def test_operation_ids_are_unique(make_app: MakeApp) -> None:
    schema = _schema(make_app())

    assert schema["paths"]
    assert duplicate_operation_ids(schema) == []


def test_duplicate_operation_ids_are_detected(make_app: MakeApp) -> None:
    app = make_app()

    def login() -> None: ...

    app.add_api_route("/_test/also-login", login, methods=["POST"])

    with pytest.warns(UserWarning, match="Duplicate Operation ID login"):
        schema = app.openapi()

    assert duplicate_operation_ids(schema) == ["login"]


@pytest.mark.parametrize(
    ("path", "operation_id"),
    [("/api/auth/token", "login"), ("/api/auth/logout", "logout")],
)
def test_auth_routes_declare_their_401_as_the_envelope(
    make_app: MakeApp, path: str, operation_id: str
) -> None:
    operation = _schema(make_app())["paths"][path]["post"]

    assert operation["operationId"] == operation_id
    for status in ("401", "422"):
        assert operation["responses"][status]["content"]["application/json"] == {
            "schema": {"$ref": "#/components/schemas/ErrorResponse"}
        }


def test_login_takes_the_password_form_and_returns_a_token(
    make_app: MakeApp,
) -> None:
    schema = _schema(make_app())
    operation = schema["paths"]["/api/auth/token"]["post"]

    assert "application/x-www-form-urlencoded" in operation["requestBody"]["content"]
    assert operation["responses"]["200"]["content"]["application/json"] == {
        "schema": {"$ref": "#/components/schemas/TokenResponse"}
    }
    token = schema["components"]["schemas"]["TokenResponse"]
    assert set(token["properties"]) == {"access_token", "token_type"}


def test_logout_is_bearer_protected_and_has_no_body(make_app: MakeApp) -> None:
    schema = _schema(make_app())
    operation = schema["paths"]["/api/auth/logout"]["post"]

    assert operation["security"] == [{"OAuth2PasswordBearer": []}]
    assert "content" not in operation["responses"]["204"]
    assert schema["components"]["securitySchemes"]["OAuth2PasswordBearer"] == {
        "type": "oauth2",
        "flows": {"password": {"scopes": {}, "tokenUrl": "/api/auth/token"}},
    }
