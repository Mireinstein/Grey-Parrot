"""
Grey Parrot Test Softphone Server
----------------------------------
Serves a browser softphone at http://localhost:5000 so you can receive
real phone calls in the browser and test the Grey Parrot extension
without Amazon Connect.

Setup:
  1. pip install -r test-softphone/requirements.txt
  2. Fill in the four TWILIO_* keys in backend/.env  (see README)
  3. Expose this server publicly with ngrok:
       ngrok http 5000
  4. In the Twilio console set your number's Voice webhook to:
       https://<ngrok-id>.ngrok.io/voice  (HTTP POST)
  5. python test-softphone/server.py
  6. Open http://localhost:5000 in Chrome with the extension loaded
  7. Call your Twilio number from your phone — browser will ring
"""

import os
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from twilio.twiml.voice_response import VoiceResponse, Dial

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Load from the shared backend .env
load_dotenv(dotenv_path=os.path.join(BASE_DIR, '..', 'backend', '.env'))

ACCOUNT_SID  = os.getenv('TWILIO_ACCOUNT_SID')
API_KEY      = os.getenv('TWILIO_API_KEY')      # Twilio API Key SID
API_SECRET   = os.getenv('TWILIO_API_SECRET')   # Twilio API Key Secret
APP_SID      = os.getenv('TWILIO_APP_SID')      # TwiML App SID

app = Flask(__name__, static_folder=BASE_DIR)


@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/token')
def get_token():
    """Return a short-lived Twilio Access Token for the browser Voice SDK."""
    token = AccessToken(ACCOUNT_SID, API_KEY, API_SECRET, identity='agent')
    grant = VoiceGrant(outgoing_application_sid=APP_SID, incoming_allow=True)
    token.add_grant(grant)
    return jsonify({'token': token.to_jwt()})


@app.route('/voice', methods=['POST'])
def voice():
    """
    Twilio calls this webhook when someone dials your Twilio number.
    We connect the call to the browser client registered as 'agent'.
    """
    resp = VoiceResponse()
    dial = Dial()
    dial.client('agent')
    resp.append(dial)
    return str(resp), 200, {'Content-Type': 'text/xml'}


if __name__ == '__main__':
    app.run(port=5000, debug=True)
