#!/usr/bin/env python3
# ai_nwanne_pipeline_fb_telegram.py
# African wisdom daily bot: fetch, generate commentary, handle images, post to FB + Telegram

import os
import json
import requests
from dotenv import load_dotenv
from openai import OpenAI
import re

load_dotenv()

# ------------------- CONFIG -------------------

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
FIXED_HASHTAGS = ["#AINwanne", "#NaijaCulture", "#AfricanAI"]

# Facebook
FB_PAGE_ID = os.getenv("FACEBOOK_PAGE_ID")
FB_ACCESS_TOKEN = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN")

# Telegram
TG_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TG_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

# ------------------- OPENAI -------------------

client = OpenAI(api_key=OPENAI_API_KEY)

def generate_commentary(proverb, interpretation):
    """Generate a short, 2-3 sentence commentary on the proverb."""
    prompt = f"""
You are an African cultural writer. Provide a short, insightful, and engaging commentary (2-3 sentences)
on this proverb. Ensure each sentence ends with a period. Keep it suitable for social media.

Proverb: {proverb}
Interpretation: {interpretation}
"""
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8,
            max_tokens=150
        )
        text = response.choices[0].message.content.strip()
        # Ensure proper punctuation
        sentences = [s.strip() for s in re.split(r'[.?!]', text) if s.strip()]
        return ". ".join(sentences) + "."
    except Exception as e:
        print(f"[WARN] OpenAI commentary failed: {e}")
        return ""

# ------------------- PROVERB FETCH -------------------

def fetch_random_proverb():
    """Fetch a fresh random proverb from the API"""
    try:
        resp = requests.get("https://africanproverbs.onrender.com/api/proverb")
        resp.raise_for_status()
        data = resp.json()
        proverb_data = {
            "proverb": data.get("proverb", "").capitalize(),
            "interpretation": data.get("interpretation", "").capitalize(),
            "native": data.get("native", "").capitalize(),
            "translation": data.get("translations", [{}])[0].get("proverb", "").capitalize() if data.get("translations") else None
        }
        return proverb_data
    except Exception as e:
        print(f"[ERROR] Failed to fetch proverb: {e}")
        return None

# ------------------- POST FORMATTING -------------------

def escape_markdown(text):
    """Escape characters for Telegram MarkdownV2"""
    if not text:
        return ""
    escape_chars = r"_*[]()~`>#+-=|{}.!$"
    return "".join(f"\\{c}" if c in escape_chars else c for c in text)

def format_facebook_post(proverb_data, commentary):
    lines = [
        "🦁 Proverb of the Day 🦁\n",
        f"🌍 Proverb:\n➡️ {proverb_data['proverb']}",
        f"📝 Interpretation:\n➡️ {proverb_data['interpretation']}",
        f"💡 Native Language / Country:\n➡️ {proverb_data['native']}"
    ]
    if proverb_data.get("translation"):
        lines.append(f"🔤 Translation:\n➡️ {proverb_data['translation']}")
    if commentary:
        lines.append(f"💬 Commentary:\n➡️ {commentary}")
    lines.append("\n✨ Share and spread African wisdom! ✨")
    lines.append(" ".join(FIXED_HASHTAGS))
    return "\n\n".join(lines)

def format_telegram_post(proverb_data, commentary):
    lines = [
        "🦁 Proverb of the Day 🦁\n",
        f"🌍 Proverb:\n➡️ {escape_markdown(proverb_data['proverb'])}",
        f"📝 Interpretation:\n➡️ {escape_markdown(proverb_data['interpretation'])}",
        f"💡 Native Language / Country:\n➡️ {escape_markdown(proverb_data['native'])}"
    ]
    if proverb_data.get("translation"):
        lines.append(f"🔤 Translation:\n➡️ {escape_markdown(proverb_data['translation'])}")
    if commentary:
        lines.append(f"💬 Commentary:\n➡️ {escape_markdown(commentary)}")
    lines.append("\n✨ Share and spread African wisdom! ✨")
    hashtags = " ".join([escape_markdown(tag) for tag in FIXED_HASHTAGS])
    lines.append(hashtags)
    return "\n\n".join(lines)

# ------------------- FACEBOOK & TELEGRAM -------------------

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

# ------------------- MAIN PIPELINE -------------------

def run_pipeline():
    proverb_data = fetch_random_proverb()
    if not proverb_data:
        print("[INFO] No proverb fetched. Exiting.")
        return

    commentary = generate_commentary(proverb_data["proverb"], proverb_data["interpretation"])
    fb_post = format_facebook_post(proverb_data, commentary)
    tg_post = format_telegram_post(proverb_data, commentary)

    post_to_facebook(fb_post)
    post_to_telegram(tg_post)

if __name__ == "__main__":
    run_pipeline()
