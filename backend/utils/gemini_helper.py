"""
Gemini AI helper for Digital Asset Protection v4.
Roles:
  1. Smart Search: Generate YouTube search queries from video title
  2. Classification: Classify matched videos into categories
  3. Anomaly Detection: Analyze propagation patterns for anomalies
  4. Takedown Generator: Generate DMCA takedown notice text
"""
import os, json, logging
from typing import List, Dict
import google.generativeai as genai

logger = logging.getLogger(__name__)
_model = None

def _get_model():
    global _model
    if _model is None:
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key: raise ValueError("GEMINI_API_KEY not set")
        genai.configure(api_key=api_key)
        _model = genai.GenerativeModel("gemini-2.0-flash")
    return _model

def _clean_json(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        text = text.rsplit("```", 1)[0]
    return text.strip()


def generate_search_queries(video_title: str, filename: str = "") -> List[str]:
    """Generate 5 optimized YouTube search queries to find pirated versions."""
    try:
        model = _get_model()
        prompt = f"""You are a sports video piracy detection system. Given a sports video title and filename,
generate exactly 5 YouTube search queries that would help find unauthorized re-uploads,
highlights, or copies of this content on YouTube.

Focus on: the sport/teams/players, common piracy patterns (re-uploads, highlights, clips),
different phrasings people use when re-uploading sports content.

Video title: {video_title}
Filename: {filename}

Return ONLY a JSON array of 5 search query strings. No explanation. No markdown."""

        response = model.generate_content(prompt)
        queries = json.loads(_clean_json(response.text))
        if isinstance(queries, list) and len(queries) > 0:
            logger.info(f"Gemini generated {len(queries)} search queries")
            return queries[:5]
    except Exception as e:
        logger.error(f"Gemini search query generation failed: {e}")

    words = video_title.replace("_", " ").replace("-", " ")
    return [f"{words} highlights", f"{words} full match", f"{words} HD",
            f"{words} clip", f"{words} replay"]


def classify_matches(matches: List[Dict]) -> List[Dict]:
    """Classify each matched YouTube video into categories."""
    if not matches: return matches
    try:
        model = _get_model()
        videos_info = [{"title": m.get("title",""), "channel": m.get("channel",""),
                        "confidence": m.get("confidence",0)} for m in matches]
        prompt = f"""Classify each video into one category:
"Highlight", "Reaction", "News", "Meme", "Full Match", "Clip", "Other"

Videos: {json.dumps(videos_info, indent=2)}

Return ONLY a JSON array of category strings in the same order."""

        response = model.generate_content(prompt)
        categories = json.loads(_clean_json(response.text))
        if isinstance(categories, list) and len(categories) == len(matches):
            for i, cat in enumerate(categories):
                matches[i]["category"] = cat
            return matches
    except Exception as e:
        logger.error(f"Gemini classification failed: {e}")

    for m in matches:
        t = m.get("title", "").lower()
        if "highlight" in t: m["category"] = "Highlight"
        elif "reaction" in t: m["category"] = "Reaction"
        elif "news" in t: m["category"] = "News"
        elif "meme" in t or "funny" in t: m["category"] = "Meme"
        elif "full" in t: m["category"] = "Full Match"
        else: m["category"] = "Clip"
    return matches


def analyze_anomalies(propagation_data: dict) -> dict:
    """
    Feature 1: Gemini Anomaly Detection
    Analyze propagation patterns and flag suspicious activity.
    """
    try:
        model = _get_model()
        prompt = f"""You are a digital asset protection analyst. Analyze this content propagation data
and identify anomalies, suspicious patterns, and risks.

Data:
- Timeline (daily detection events): {json.dumps(propagation_data.get('timeline', []))}
- Top channels involved: {json.dumps(propagation_data.get('channels', []))}
- Channel risk scores: {json.dumps(propagation_data.get('channel_risks', []))}
- Total violations: {propagation_data.get('total_violations', 0)}
- High risk violations: {propagation_data.get('high_risk', 0)}

Analyze and return a JSON object with:
{{
  "risk_level": "low" | "medium" | "high" | "critical",
  "anomalies": ["list of detected anomalies as strings"],
  "recommendations": ["list of recommended actions"],
  "summary": "2-3 sentence executive summary of the threat landscape",
  "suspicious_channels": ["channels that appear most suspicious"],
  "trend": "increasing" | "stable" | "decreasing"
}}

Return ONLY the JSON object. No markdown. No explanation."""

        response = model.generate_content(prompt)
        result = json.loads(_clean_json(response.text))
        logger.info(f"Gemini anomaly analysis: risk={result.get('risk_level')}")
        return result
    except Exception as e:
        logger.error(f"Gemini anomaly detection failed: {e}")
        return {
            "risk_level": "unknown",
            "anomalies": ["Analysis unavailable — Gemini API error"],
            "recommendations": ["Retry analysis", "Check API key"],
            "summary": "Unable to perform anomaly analysis at this time.",
            "suspicious_channels": [],
            "trend": "unknown"
        }


def generate_takedown_notice(violation: dict, asset: dict) -> str:
    """
    Feature 2: DMCA Takedown Generator
    Generate a professional DMCA takedown notice using Gemini.
    """
    try:
        model = _get_model()
        prompt = f"""Generate a professional DMCA takedown notice for the following copyright violation.

ORIGINAL CONTENT:
- Title: {asset.get('title', '')}
- Registered: {asset.get('registered_at', '')}
- Duration: {asset.get('duration', 0)} seconds
- Digital Certificate Hash: {asset.get('certificate_hash', '')}

INFRINGING CONTENT:
- YouTube Video: {violation.get('title', '')}
- Channel: {violation.get('channel', '')}
- URL: {violation.get('url', '')}
- Detection Confidence: {(violation.get('confidence', 0) * 100):.1f}%
- Visual Match: {(violation.get('visual_similarity', 0) * 100):.1f}%
- Audio Match: {(violation.get('audio_similarity', 0) * 100):.1f}%
- Match Type: {violation.get('match_type', '')}
- Category: {violation.get('category', '')}
- First Detected: {violation.get('first_detected_at', '')}

Generate a complete, professional DMCA takedown notice that includes:
1. Identification of the copyrighted work
2. Identification of the infringing material with URL
3. Statement of good faith belief
4. Statement of accuracy under penalty of perjury
5. Contact information placeholder
6. Digital signature placeholder

Make it formal, legally sound, and ready to submit. Use proper formatting."""

        response = model.generate_content(prompt)
        notice = response.text.strip()
        logger.info(f"Generated takedown notice for violation {violation.get('id', '')}")
        return notice
    except Exception as e:
        logger.error(f"Takedown generation failed: {e}")
        return f"""DMCA TAKEDOWN NOTICE

To: YouTube / Google LLC
Re: Copyright Infringement — {violation.get('title', 'Unknown')}

The content at {violation.get('url', '')} infringes upon copyrighted material
"{asset.get('title', '')}" (registered {asset.get('registered_at', '')}).

Detection confidence: {(violation.get('confidence', 0)*100):.1f}%
Digital Certificate: {asset.get('certificate_hash', '')}

[Auto-generated fallback notice — Gemini API unavailable]
"""
