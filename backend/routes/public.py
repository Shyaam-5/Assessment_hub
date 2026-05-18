"""Public, unauthenticated endpoints."""

from fastapi import APIRouter

from config import settings

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/config")
async def public_config():
    return {
        "subscriptionId": settings.SUBSCRIPTION_ID,
    }
