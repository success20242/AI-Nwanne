#!/usr/bin/env python3
# ai_nwanne_pipeline_fb_telegram.py
# African wisdom daily bot: fetch, generate commentary, post to FB + Telegram

import os
import requests
from dotenv import load_dotenv
from random import choice

load_dotenv()

# ------------------- CONFIG -------------------
FIXED_HASHTAGS = ["#AINwanne", "#NaijaCulture", "#AfricanAI"]

# Facebook
FB_PAGE_ID = os.getenv("FACEBOOK_PAGE_ID")
FB_ACCESS_TOKEN = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN")

# Telegram
TG_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TG_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

# African proverbs API
PROVERB_API_URL = "https://africanproverbs.onrender.com/api/proverb"

# ------------------- HELPERS -------------------

def fetch_random_proverb():
    """Fetch a fresh proverb from the API."""
    try:
        resp = requests.get(PROVERB_API_URL)
        if resp.ok:
            data = resp.json()
            proverb = data.get("proverb", "").strip()
            interpretation = data.get("interpretation", "").strip()
            native = data.get("native", "").strip()
            translations = data.get("translations", [])
            translation_text = translations[0]["proverb"] if translations else ""
            
            # Capitalize the first letter of the proverb
            if proverb:
                proverb = proverb[0].upper() + proverb[1:]

            return {
                "proverb": proverb,
                "interpretation": interpretation,
                "native": native,
                "translation": translation_text
            }
    except Exception as e:
        print(f"[ERROR] Failed to fetch proverb: {e}")
    return None

# ------------------- FORMATTING -------------------

def format_facebook_post(proverb_data):
    """Format a professional Facebook post."""
    lines = [
        f"🦁 Proverb of the Day 🦁\n",
        f"🌍 Proverb:\n➡️ {proverb_data['proverb']}\n",
        f"📝 Interpretation:\n➡️ {proverb_data['interpretation']}\n",
        f"💡 Native Language / Country:\n➡️ {proverb_data['native']}"
    ]
    if proverb_data.get("translation"):
        lines.append(f"🔤 Translation:\n➡️ {proverb_data['translation']}")

    lines.append("\n✨ Share and spread African wisdom! ✨")
    lines.append(" ".join(FIXED_HASHTAGS))
    return "\n\n".join(lines)


def format_telegram_post(proverb_data):
    """Format a Telegram post with MarkdownV2 escape."""
    def escape_markdown(text):
        # Only escape Telegram MarkdownV2 special chars
        escape_chars = r"_*[]()~`>#+-=|{}.!\""
        for ch in escape_chars:
            text = text.replace(ch, f"\\{ch}")
        return text

    lines = [
        "🦁 Proverb of the Day 🦁\n",
        f"🌍 Proverb:\n➡️ {escape_markdown(proverb_data['proverb'])}\n",
        f"📝 Interpretation:\n➡️ {escape_markdown(proverb_data['interpretation'])}\n",
        f"💡 Native Language / Country:\n➡️ {escape_markdown(proverb_data['native'])}"
    ]
    if proverb_data.get("translation"):
        lines.append(f"🔤 Translation:\n➡️ {escape_markdown(proverb_data['translation'])}")

    lines.append("\n✨ Share and spread African wisdom! ✨")
    lines.append(" ".join(FIXED_HASHTAGS))
    return "\n\n".join(lines)

# ------------------- POSTING -------------------

def post_to_facebook(content):
    url = f"https://graph.facebook.com/{FB_PAGE_ID}/feed"
    resp = requests.post(url, data={"message": content, "access_token": FB_ACCESS_TOKEN})
    if resp.ok:
        print(f"✅ Posted to Facebook: {resp.json().get('id')}")
    else:
        print(f"❌ Facebook error: {resp.text}")

def post_to_telegram(content):
    url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TG_CHAT_ID,
        "text": content,
        "parse_mode": "MarkdownV2",
        "disable_web_page_preview": True
    }
    resp = requests.post(url, json=payload)
    if resp.ok:
        print(f"✅ Posted to Telegram: {resp.json()['result']['message_id']}")
    else:
        print(f"❌ Telegram error: {resp.text}")

# ------------------- PIPELINE -------------------

def run_pipeline():
    proverb_data = fetch_random_proverb()
    if not proverb_data:
        print("[WARN] No proverb fetched. Exiting.")
        return

    fb_post = format_facebook_post(proverb_data)
    tg_post = format_telegram_post(proverb_data)

    post_to_facebook(fb_post)
    post_to_telegram(tg_post)


if __name__ == "__main__":
    run_pipeline()
