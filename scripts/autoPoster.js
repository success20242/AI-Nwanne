#!/usr/bin/env python3
# ai_nwanne_pipeline_fb_telegram.py
# African wisdom daily bot: fetch, generate commentary, handle images, post to FB + Telegram

import os
import json
import hashlib
import requests
import feedparser
from datetime import datetime, timedelta
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# ------------------- CONFIG -------------------

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
USED_TOPICS_FILE = "used_topics.json"
MAX_TOPIC_MEMORY = 500
FIXED_HASHTAGS = ["#AINwanne", "#NaijaCulture", "#AfricanAI"]

# Facebook
FB_PAGE_ID = os.getenv("FACEBOOK_PAGE_ID")
FB_ACCESS_TOKEN = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN")

# Telegram
TG_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TG_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

# Optional image support
USE_IMAGE = os.getenv("USE_IMAGE", "False").lower() == "true"
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

# Wisdom Sources (can be JSON file or RSS feed URLs)
WISDOM_FEEDS = [
    "https://www.afriprov.com/rss",  # placeholder example
]

# ------------------- HELPERS -------------------

def get_used_topics():
    if not os.path.exists(USED_TOPICS_FILE):
        return []
    try:
        with open(USED_TOPICS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def save_used_topic(topic):
    topics = get_used_topics()
    topics.append(topic)
    topics = topics[-MAX_TOPIC_MEMORY:]
    with open(USED_TOPICS_FILE, "w") as f:
        json.dump(topics, f, indent=2)

def hash_text(text):
    return hashlib.md5(text.encode()).hexdigest()

def fetch_wisdom_from_feeds():
    entries = []
    for feed_url in WISDOM_FEEDS:
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries:
                title = entry.get("title", "").strip()
                summary = entry.get("summary", "").strip()
                link = entry.get("link", "").strip()
                if title:
                    entries.append({"title": title, "summary": summary, "link": link})
        except Exception as e:
            print(f"[WARN] Failed to parse feed {feed_url}: {e}")
    return entries

# ------------------- OPENAI -------------------

client = OpenAI(api_key=OPENAI_API_KEY)

def generate_wisdom_content(title="", summary="", link=""):
    used_topics = get_used_topics()
    last_100 = used_topics[-100:]

    prompt = f"""
You are an African culture and heritage writer.

Task:
1. Rewrite or enrich this proverb for a daily social media post:
Title: {title}
Summary: {summary}
Link: {link}

2. Produce a short explanation (1-2 sentences).
3. Produce a structured commentary (HTML <ul><li>...</li></ul>) with cultural insights, usage, or tips.
4. Avoid repeating proverbs used in the last 100 posts:
{chr(10).join(last_100)}

Constraints:
- Max 80 words for the post.
- Must be authentic, culturally accurate, emotionally engaging.
- Include exactly 3 hashtags (must include #AINwanne).

Output Format:
---
Proverb: "..."
Explanation: ...
Commentary:
<ul><li>...</li></ul>
---
"""
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.9
    )

    text = response.choices[0].message.content.strip()
    import re
    match = re.search(r'Proverb:\s*["“](.+?)["”]', text)
    if match:
        save_used_topic(match.group(1))

    return text

# ------------------- CLOUDINARY IMAGE -------------------

def upload_image_to_cloudinary(image_url):
    if not (CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET):
        return None
    upload_url = f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/image/upload"
    try:
        resp = requests.post(
            upload_url,
            data={"file": image_url, "upload_preset": "ml_default"},
            auth=(CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)
        )
        resp.raise_for_status()
        return resp.json().get("secure_url")
    except Exception as e:
        print(f"[ERROR] Cloudinary upload failed: {e}")
        return None

# ------------------- FACEBOOK -------------------

def post_to_facebook(content):
    url = f"https://graph.facebook.com/{FB_PAGE_ID}/feed"
    resp = requests.post(url, data={"message": content, "access_token": FB_ACCESS_TOKEN})
    if resp.ok:
        print(f"✅ Posted to Facebook: {resp.json().get('id')}")
        return resp.json()
    else:
        print(f"❌ Facebook error: {resp.text}")
        return None

# ------------------- TELEGRAM -------------------

def post_to_telegram(content):
    url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TG_CHAT_ID,
        "text": content,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }
    resp = requests.post(url, json=payload)
    if resp.ok:
        print(f"✅ Posted to Telegram: {resp.json()['result']['message_id']}")
        return resp.json()
    else:
        print(f"❌ Telegram error: {resp.text}")
        return None

# ------------------- MAIN -------------------

def run_pipeline():
    wisdom_entries = fetch_wisdom_from_feeds()
    if not wisdom_entries:
        wisdom_entries = [{"title": "", "summary": "", "link": ""}]

    for entry in wisdom_entries:
        try:
            content = generate_wisdom_content(entry["title"], entry["summary"], entry["link"])

            # Optional image
            img_html = ""
            if USE_IMAGE and entry.get("link"):
                cloud_img = upload_image_to_cloudinary(entry["link"])
                if cloud_img:
                    img_html = f'<img src="{cloud_img}" alt="African Wisdom" style="max-width:100%;">'

            social_post = content + "\n\n" + " ".join(FIXED_HASHTAGS)

            # Post to platforms
            post_to_facebook(social_post)
            post_to_telegram(social_post)

        except Exception as e:
            print(f"[ERROR] Pipeline failed for entry {entry}: {e}")

if __name__ == "__main__":
    run_pipeline()
