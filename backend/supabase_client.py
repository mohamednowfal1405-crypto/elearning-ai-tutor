import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# The backend uses the SERVICE key (not the anon key) because it needs
# privileged access to write files/data on behalf of users.
# NEVER expose this key to the frontend/browser.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)