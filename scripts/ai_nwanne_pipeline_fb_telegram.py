#!/usr/bin/env python3
# ai_nwanne_pipeline_fb_telegram.py
# African wisdom daily bot with 7-day rotation

import os
import json
import hashlib
import requests
import feedparser
import random
from datetime import datetime, timedelta
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# ------------------- CONFIG -------------------

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
USED_TOPICS_FILE = "used_topics.json"  # will store {"proverb": "...", "last_posted": "YYYY-MM-DD"}
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

# Feed & posting limits
FEED_HOURS_BACK = int(os.getenv("FEED_HOURS_BACK", 72))
MAX_POSTS_PER_RUN = int(os.getenv("MAX_POSTS_PER_RUN", 2))
POST_ROTATION_DAYS = 7

# Wisdom Sources (multiple RSS feeds)
WISDOM_FEEDS = [
    "https://www.afriprov.com/rss",
    "https://www.example2.com/rss"
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

def save_used_topic(proverb):
    topics = get_used_topics()
    today = datetime.utcnow().date().isoformat()
    # Remove old duplicate if exists
    topics = [t for t in topics if t["proverb"] != proverb]
    topics.append({"proverb": proverb, "last_posted": today})
    topics = topics[-MAX_TOPIC_MEMORY:]
    with open(USED_TOPICS_FILE, "w") as f:
        json.dump(topics, f, indent=2)

def was_posted_recently(proverb):
    topics = get_used_topics()
    cutoff_date = datetime.utcnow().date() - timedelta(days=POST_ROTATION_DAYS)
    for t in topics:
        if t["proverb"] == proverb:
            last_posted = datetime.fromisoformat(t["last_posted"]).date()
            if last_posted >= cutoff_date:
                return True
    return False

def hash_text(text):
    return hashlib.md5(text.encode()).hexdigest()

def fetch_wisdom_from_feeds():
    entries = []
    cutoff_time = datetime.utcnow() - timedelta(hours=FEED_HOURS_BACK)
    for feed_url in WISDOM_FEEDS:
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries:
                title = entry.get("title", "").strip()
                summary = entry.get("summary", "").strip()
                link = entry.get("link", "").strip()

                # Filter by published time if available
                published_parsed = entry.get("published_parsed") or entry.get("updated_parsed")
                if published_parsed:
                    entry_time = datetime(*published_parsed[:6])
                    if entry_time < cutoff_time:
                        continue

                if title:
                    entries.append({"title": title, "summary": summary, "link": link})
        except Exception as e:
            print(f"[WARN] Failed to parse feed {feed_url}: {e}")

    random.shuffle(entries)
    return entries

# ------------------- OPENAI -------------------

client = OpenAI(api_key=OPENAI_API_KEY)

def generate_wisdom_content(title="", summary="", link=""):
    used_topics = get_used_topics()
    last_100 = [t["proverb"] for t in used_topics[-100:]]

    prompt = f"""
You are an African culture and heritage writer.

Task:
1. Rewrite or enrich this proverb for a daily social media post:
Title: {title}
Summary: {summary}
Link: {link}

2. Produce a short explanation (1-2 sentences).
3. Produce a structured commentary (use dashes "-" for bullets) with cultural insights, usage, or tips.
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
- ...
- ...
- ...
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
        "parse_mode": "MarkdownV2",
        "disable_web_page_preview": True
    }
    resp = requests.post(url, json=payload)
    if resp.ok:
        print(f"✅ Posted to Telegram: {resp.json()['result']['message_id']}")
        return resp.json()
    else:
        print(f"❌ Telegram error: {resp.text}")
        return None

# ------------------- MAIN PIPELINE -------------------

def run_pipeline():
    wisdom_entries = fetch_wisdom_from_feeds()
    if not wisdom_entries:
        wisdom_entries = [{"title": "", "summary": "", "link": ""} for _ in range(MAX_POSTS_PER_RUN)]

    posted_hashes = set()
    posts_done = 0

    for entry in wisdom_entries:
        if posts_done >= MAX_POSTS_PER_RUN:
            break
        try:
            content = generate_wisdom_content(entry["title"], entry["summary"], entry["link"])

            # Extract proverb to check rotation
            import re
            match = re.search(r'Proverb:\s*["“](.+?)["”]', content)
            proverb = match.group(1) if match else None
            if not proverb or was_posted_recently(proverb):
                continue

            # Avoid duplicate posts in same run
            content_hash = hash_text(content)
            if content_hash in posted_hashes:
                continue
            posted_hashes.add(content_hash)

            # Optional image
            img_text = ""
            if USE_IMAGE and entry.get("link"):
                cloud_img = upload_image_to_cloudinary(entry["link"])
                if cloud_img:
                    img_text = f'[Image]({cloud_img})\n\n'

            # Split content into sections
            lines = content.splitlines()
            proverb_line = next((l for l in lines if l.startswith("Proverb:")), "")
            explanation_line = next((l for l in lines if l.startswith("Explanation:")), "")
            commentary_lines = [l for l in lines if l.startswith("-")]

            # Facebook post
            fb_post = "\n".join([proverb_line, explanation_line, ""] + commentary_lines + ["", " ".join(FIXED_HASHTAGS)])
            if img_text:
                fb_post = img_text + fb_post

            # Telegram post (MarkdownV2 safe)
            tg_post = fb_post
            for ch in r"_*[]()~`>#+-=|{}.!":
                tg_post = tg_post.replace(ch, f"\\{ch}")

            # Post
            post_to_facebook(fb_post)
            post_to_telegram(tg_post)

            posts_done += 1

        except Exception as e:
            print(f"[ERROR] Pipeline failed for entry {entry}: {e}")

if __name__ == "__main__":
    run_pipeline()
