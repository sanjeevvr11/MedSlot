from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.routers import admin, auth, bookings, catalog

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_HEADER = "x-requested-with"

app = FastAPI(title="MedSlot API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.middleware("http")
async def csrf_guard(request: Request, call_next):
    # Browsers cannot add custom headers to cross-site form posts or simple
    # requests, so requiring one on state-changing calls blocks CSRF on top of
    # the SameSite=Lax session cookie.
    if request.method in UNSAFE_METHODS and request.headers.get(CSRF_HEADER) != "MedSlot":
        return JSONResponse(
            {"detail": {"message": "Missing request header.", "code": "csrf"}}, status_code=403
        )
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    fields: dict[str, str] = {}
    for error in exc.errors():
        field = str(error["loc"][-1]) if error["loc"] else "request"
        if error["type"] == "missing":
            message = "This field is required."
        else:
            message = error["msg"].removeprefix("Value error, ")
        fields.setdefault(field, message)
    return JSONResponse(
        {
            "detail": {
                "message": next(iter(fields.values()), "Invalid request."),
                "code": "validation_error",
                "fields": fields,
            }
        },
        status_code=422,
    )


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


for router in (auth.router, catalog.router, bookings.router, admin.router):
    app.include_router(router, prefix="/api")
