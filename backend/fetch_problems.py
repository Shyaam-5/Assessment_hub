import logging
logger = logging.getLogger(__name__)
audit_logger = logging.getLogger('audit')
audit_logger.debug('Audit logger initialized for module')

import urllib.request
import json

try:
    response = urllib.request.urlopen('http://localhost:8000/api/students/39d54c3e-fd91-4b98-9fcd-1f0d1e97d59a/problems')
    data = json.loads(response.read().decode('utf-8'))
    for p in data:
        print(f"Problem: {p['title']}")
        print(f"Proctoring: {p.get('proctoring')}")
        print("-" * 20)
except Exception as e:
    print(f"Error: {e}")

