import os
import io
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def transcribe(audio):
    """Transcribe recorded audio (e.g. st.audio_input UploadedFile) to text using Whisper."""
    audio_file = io.BytesIO(audio.getvalue())
    audio_file.name = "audio.wav"
    transcript = openai_client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file
    )
    return transcript.text


def speak(text):
    """Convert text to speech audio bytes using OpenAI TTS."""
    response = openai_client.audio.speech.create(
        model="tts-1",
        voice="alloy",
        input=text
    )
    return response.content
