import json
import os
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

load_dotenv()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

if GOOGLE_REDIRECT_URI.startswith("http://"):
    # oauthlib refuses non-HTTPS redirect URIs by default; localhost dev has no TLS.
    os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")

# Google frequently returns extra granted scopes (e.g. openid) beyond what was
# requested; without this, oauthlib treats that as a hard error instead of a no-op.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

SCOPES = ["https://www.googleapis.com/auth/calendar.events", "openid", "email"]
TOKENS_FILE = "google_tokens.json"
PENDING_AUTH_FILE = "google_oauth_pending.json"

CLIENT_CONFIG = {
    "web": {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [GOOGLE_REDIRECT_URI],
    }
}


def _build_flow():
    return Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI)


def get_authorization_url():
    flow = _build_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline", prompt="consent", include_granted_scopes="true"
    )
    # PKCE: the code_verifier generated for this flow must be reused when the
    # code is exchanged in the callback request, which is a separate Flow instance.
    with open(PENDING_AUTH_FILE, 'w', encoding='utf-8') as f:
        json.dump({"code_verifier": flow.code_verifier, "state": state}, f)
    return auth_url


def save_tokens(tokens):
    with open(TOKENS_FILE, 'w', encoding='utf-8') as f:
        json.dump(tokens, f, indent=2)


def load_tokens():
    try:
        with open(TOKENS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def is_connected():
    tokens = load_tokens()
    return bool(tokens and tokens.get('refresh_token'))


def disconnect():
    tokens = load_tokens()
    if tokens and tokens.get('refresh_token'):
        try:
            requests.post(
                "https://oauth2.googleapis.com/revoke",
                params={"token": tokens['refresh_token']},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=15,
            )
        except requests.RequestException:
            pass  # best-effort revoke; the local disconnect still proceeds
    for path in (TOKENS_FILE, PENDING_AUTH_FILE):
        if os.path.exists(path):
            os.remove(path)


def get_user_email():
    try:
        access_token = get_valid_access_token()
    except ValueError:
        return None
    try:
        response = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
        response.raise_for_status()
        return response.json().get('email')
    except requests.RequestException:
        # Tokens from before the email scope was added won't have it granted --
        # the user needs to sign out and reconnect to pick up the new scope.
        return None


def exchange_code_for_tokens(code):
    flow = _build_flow()
    try:
        with open(PENDING_AUTH_FILE, 'r', encoding='utf-8') as f:
            pending = json.load(f)
        flow.code_verifier = pending.get('code_verifier')
    except FileNotFoundError:
        pass

    flow.fetch_token(code=code)

    if os.path.exists(PENDING_AUTH_FILE):
        os.remove(PENDING_AUTH_FILE)

    creds = flow.credentials
    tokens = {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
    }
    save_tokens(tokens)
    return tokens


def get_valid_access_token():
    tokens = load_tokens()
    if not tokens or not tokens.get('refresh_token'):
        raise ValueError("Google Calendar is not connected yet.")

    expiry = None
    if tokens.get('expiry'):
        expiry = datetime.fromisoformat(tokens['expiry']).astimezone(timezone.utc).replace(tzinfo=None)

    creds = Credentials(
        token=tokens.get('access_token'),
        refresh_token=tokens.get('refresh_token'),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
        expiry=expiry,
    )

    if not creds.valid:
        creds.refresh(GoogleAuthRequest())
        tokens['access_token'] = creds.token
        tokens['expiry'] = creds.expiry.isoformat() if creds.expiry else None
        save_tokens(tokens)

    return creds.token


def create_calendar_event(access_token, summary, date_str, start_str, end_str, description=None):
    local_tz = datetime.now().astimezone().tzinfo
    event_date = datetime.fromisoformat(date_str).date()
    start_dt = datetime.combine(event_date, datetime.strptime(start_str, "%H:%M").time(), tzinfo=local_tz)
    end_dt = datetime.combine(event_date, datetime.strptime(end_str, "%H:%M").time(), tzinfo=local_tz)

    body = {
        "summary": summary,
        "start": {"dateTime": start_dt.isoformat()},
        "end": {"dateTime": end_dt.isoformat()},
    }
    if description:
        body["description"] = description

    response = requests.post(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        json=body,
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def delete_calendar_event(access_token, event_id):
    response = requests.delete(
        f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )
    if response.status_code not in (204, 404, 410):
        response.raise_for_status()


def event_exists(access_token, event_id):
    response = requests.get(
        f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )
    if response.status_code in (404, 410):
        return False
    response.raise_for_status()
    # Google keeps deleted events around briefly with status "cancelled" rather
    # than always 404ing -- a manually-deleted event can show up either way.
    return response.json().get('status') != 'cancelled'


def list_upcoming_events(days_ahead):
    access_token = get_valid_access_token()
    now = datetime.now().astimezone()
    time_min = now.isoformat()
    time_max = (now + timedelta(days=max(days_ahead, 1))).isoformat()

    response = requests.get(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "timeMin": time_min, "timeMax": time_max,
            "singleEvents": "true", "orderBy": "startTime", "maxResults": 100,
        },
        timeout=15,
    )
    response.raise_for_status()

    busy = []
    for event in response.json().get('items', []):
        start = event.get('start', {}).get('dateTime')
        end = event.get('end', {}).get('dateTime')
        if not start or not end:
            continue  # skip all-day events (no specific time to avoid)
        start_dt = datetime.fromisoformat(start)
        end_dt = datetime.fromisoformat(end)
        busy.append({
            "date": start_dt.date().isoformat(),
            "start": start_dt.strftime("%H:%M"),
            "end": end_dt.strftime("%H:%M"),
            "summary": event.get('summary', 'Busy'),
        })
    return busy
