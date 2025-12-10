import pytest
from httpx import AsyncClient


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_calendar_sync_flow(api_client: AsyncClient, user_token: str):
    """Ensure calendar listings respond and expose events endpoint."""
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = await api_client.get("/api/integrations/calendar/calendars", headers=headers)

    if resp.status_code == 404:
        pytest.skip("Calendar integration not enabled")

    assert resp.status_code == 200, resp.text
    calendars = resp.json()
    assert isinstance(calendars, list)


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_nextcloud_file_scan(api_client: AsyncClient, user_token: str):
    """Trigger file scan/index flow and verify the response shape."""
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = await api_client.post(
        "/api/integrations/files/scan-and-index",
        params={"source_type": "guideline"},
        headers=headers,
    )

    if resp.status_code == 404:
        pytest.skip("File indexer not enabled")

    assert resp.status_code in [200, 202], resp.text
    body = resp.json()
    assert "files_discovered" in body
    assert "files_indexed" in body


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_carddav_contacts_flow(api_client: AsyncClient, user_token: str):
    """List CardDAV address books and contacts."""
    headers = {"Authorization": f"Bearer {user_token}"}
    books_resp = await api_client.get("/api/integrations/contacts/addressbooks", headers=headers)

    if books_resp.status_code == 404:
        pytest.skip("CardDAV integration not enabled")

    assert books_resp.status_code == 200, books_resp.text
    address_books = books_resp.json().get("address_books", [])
    assert isinstance(address_books, list)

    contacts_resp = await api_client.get("/api/integrations/contacts", headers=headers)
    assert contacts_resp.status_code == 200, contacts_resp.text
    contacts = contacts_resp.json().get("contacts", [])
    assert isinstance(contacts, list)


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_email_listing_flow(api_client: AsyncClient, user_token: str):
    """Verify IMAP/SMTP endpoints are reachable."""
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = await api_client.get("/api/integrations/email/folders", headers=headers)

    if resp.status_code in (400, 404):
        pytest.skip("Email integration not configured")

    assert resp.status_code == 200, resp.text
    folders = resp.json().get("folders", [])
    assert isinstance(folders, list)

    messages_resp = await api_client.get("/api/integrations/email/messages", headers=headers)
    assert messages_resp.status_code == 200, messages_resp.text
    payload = messages_resp.json()
    assert "messages" in payload
