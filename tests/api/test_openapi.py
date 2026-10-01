"""The OpenAPI schema publishes the error envelope and stable operation IDs."""

from typing import Any

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from bmad_first_project.main import create_app


def _app_with_route() -> FastAPI:
    app = create_app()

    @app.get("/_test/things/{thing_id}")
    def get_thing(thing_id: int) -> dict[str, int]:
        return {"id": thing_id}

    return app


def _schema(app: FastAPI) -> dict[str, Any]:
    response = TestClient(app).get("/openapi.json")
    assert response.status_code == 200
    return response.json()


def test_bare_app_publishes_error_schemas() -> None:
    schemas = _schema(create_app())["components"]["schemas"]

    assert set(schemas) == {"ErrorResponse", "ErrorBody"}
    assert schemas["ErrorResponse"]["properties"]["error"] == {
        "$ref": "#/components/schemas/ErrorBody"
    }


def test_reason_is_optional_and_never_null() -> None:
    body = _schema(create_app())["components"]["schemas"]["ErrorBody"]

    assert body["required"] == ["code", "message"]
    assert body["properties"]["reason"] == {"type": "string", "title": "Reason"}


def test_error_schemas_match_what_routes_generate() -> None:
    bare = _schema(create_app())["components"]["schemas"]
    routed = _schema(_app_with_route())["components"]["schemas"]

    assert routed["ErrorResponse"] == bare["ErrorResponse"]
    assert routed["ErrorBody"] == bare["ErrorBody"]


def test_route_422_is_error_response_with_function_name_operation_id() -> None:
    schema = _schema(_app_with_route())
    operation = schema["paths"]["/_test/things/{thing_id}"]["get"]

    assert operation["operationId"] == "get_thing"
    assert operation["responses"]["422"]["content"]["application/json"] == {
        "schema": {"$ref": "#/components/schemas/ErrorResponse"}
    }
    assert "HTTPValidationError" not in schema["components"]["schemas"]
    assert "ValidationError" not in schema["components"]["schemas"]


def test_schema_is_built_once_and_cached() -> None:
    app = create_app()

    assert app.openapi() is app.openapi()


def test_included_router_routes_inherit_the_contract() -> None:
    router = APIRouter(prefix="/api/things")

    @router.post("/{thing_id}/archive")
    def archive_thing(thing_id: int) -> dict[str, int]:
        return {"id": thing_id}

    app = create_app()
    app.include_router(router)
    operation = _schema(app)["paths"]["/api/things/{thing_id}/archive"]["post"]

    assert operation["operationId"] == "archive_thing"
    assert operation["responses"]["422"]["content"]["application/json"] == {
        "schema": {"$ref": "#/components/schemas/ErrorResponse"}
    }
