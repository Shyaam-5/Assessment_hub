import logging
logger = logging.getLogger(__name__)
audit_logger = logging.getLogger('audit')
audit_logger.debug('Audit logger initialized for module')

"""Reusable pagination helper."""

import math


def paginated_response(
    *,
    data: list,
    total: int,
    page: int,
    limit: int,
) -> dict:
    """Return a paginated response dict matching the Node.js helper."""
    total_pages = math.ceil(total / limit) if limit else 1
    return {
        "data": data,
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "totalPages": total_pages,
            "hasMore": page < total_pages,
        },
    }

