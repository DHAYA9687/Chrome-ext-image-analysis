from flask import Flask, request, jsonify
from flask_cors import CORS
from mongoengine import connect, Document, StringField, DateTimeField
from datetime import datetime
from waitress import serve
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv()

# Get MongoDB URI and port from environment variables
MONGO_URI = os.getenv('MONGO_URI')
PORT = int(os.getenv('PORT'))

# Initialize Flask app
app = Flask(__name__)
CORS(app)

try:
    print("Connecting to MongoDB...")
    connect(db='image_db', host=MONGO_URI)
    print("MongoDB connected successfully")
except Exception as e:
    print(f"MongoDB connection failed: {str(e)}")
    raise

class ImageData(Document):
    image_url = StringField(required=True, unique=True)
    description = StringField(required=True)
    created_at = DateTimeField(default=datetime.utcnow)
    meta = {'collection': 'images'}

@app.route('/api/images', methods=['POST'])
def store_image():
    try:
        data = request.get_json()
        if not data or 'image_url' not in data or 'description' not in data:
            return jsonify({'error': 'Missing image_url or description'}), 400

        image_url = data['image_url']
        description = data['description']

        if ImageData.objects(image_url=image_url).first():
            return jsonify({'error': 'Image URL already exists'}), 409

        image_data = ImageData(image_url=image_url, description=description)
        image_data.save()

        return jsonify({
            'message': 'Image data stored successfully',
            'data': {
                'image_url': image_data.image_url,
                'description': image_data.description,
                'created_at': image_data.created_at.isoformat()
            }
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/images', methods=['GET'])
def get_images():
    try:
        images = ImageData.objects()
        return jsonify([
            {
                'image_url': img.image_url,
                'description': img.description,
                'created_at': img.created_at.isoformat()
            } for img in images
        ]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/test', methods=['GET'])
def test():
    return jsonify({'message': 'Test route is working!'}), 200


@app.route('/api/images/single', methods=['GET'])
def get_image():
    try:
        image_url = request.args.get('image_url')
        if not image_url:
            return jsonify({'error': 'Missing image_url parameter'}), 400
        image_data = ImageData.objects(image_url=image_url).first()
        if not image_data:
            return jsonify({'error': 'Image not found'}), 404
        return jsonify({
            'image_url': image_data.image_url,
            'description': image_data.description,
            'created_at': image_data.created_at.isoformat()
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("Starting Flask app with Waitress...")
    serve(app, host='0.0.0.0', port=PORT)