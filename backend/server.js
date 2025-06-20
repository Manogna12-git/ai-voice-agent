// Load environment variables first
require('dotenv').config();

const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cors = require('cors');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const PORT = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Storage for audio files
const storage = multer.diskStorage({
  destination: './temp/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Simple AI Voice Agent Class (without external APIs for now)
class AIVoiceAgent {
  constructor() {
    this.isActive = false;
    this.conversationContext = [];
    this.currentMeetingId = null;
    this.participantsList = [];
    this.voiceSettings = {
      voice: 'en-US-Neural2-F',
      speed: 1.0,
      pitch: 0.0
    };
  }

  // Initialize agent for a meeting
  async initializeMeeting(meetingId, agentPersonality) {
    this.currentMeetingId = meetingId;
    this.isActive = true;
    this.conversationContext = [{
      role: 'system',
      content: `You are an AI assistant representing a human in a Zoom meeting. ${agentPersonality || 'You are professional, helpful, and engage naturally in conversation. Keep responses concise and meeting-appropriate.'}`
    }];
    
    console.log(`AI Agent initialized for meeting: ${meetingId}`);
  }

  // Process audio input and generate response
  async processAudioInput(audioBuffer) {
    try {
      // For now, return a mock response
      const mockTranscription = "Hello, how can I help you today?";
      const mockResponse = "Thank you for your question. I'm an AI assistant ready to help with this meeting.";
      
      return {
        transcription: mockTranscription,
        response: mockResponse,
        audio: null // Will add actual TTS later
      };
    } catch (error) {
      console.error('Error processing audio:', error);
      return null;
    }
  }

  // Generate AI response (mock for now)
  async generateResponse(input) {
    try {
      // Mock response for testing
      const responses = [
        "That's a great point! I'll make note of that.",
        "I understand. Let me think about that for a moment.",
        "Excellent question. Based on what we've discussed...",
        "Thank you for sharing that information.",
        "I agree with that approach. It sounds very practical."
      ];
      
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      return randomResponse;
    } catch (error) {
      console.error('AI response generation error:', error);
      return "I'm sorry, I didn't catch that. Could you please repeat?";
    }
  }

  // Update voice settings
  updateVoiceSettings(settings) {
    this.voiceSettings = { ...this.voiceSettings, ...settings };
  }
}

// Initialize AI Agent
const aiAgent = new AIVoiceAgent();

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'init_meeting':
          await aiAgent.initializeMeeting(data.meetingId, data.personality);
          ws.send(JSON.stringify({
            type: 'meeting_initialized',
            success: true,
            meetingId: data.meetingId
          }));
          break;

        case 'audio_data':
          const audioBuffer = Buffer.from(data.audio, 'base64');
          const result = await aiAgent.processAudioInput(audioBuffer);
          
          if (result) {
            ws.send(JSON.stringify({
              type: 'ai_response',
              transcription: result.transcription,
              response: result.response,
              audio: result.audio
            }));
          }
          break;

        case 'update_voice':
          aiAgent.updateVoiceSettings(data.settings);
          ws.send(JSON.stringify({
            type: 'voice_updated',
            success: true
          }));
          break;

        case 'stop_agent':
          aiAgent.isActive = false;
          ws.send(JSON.stringify({
            type: 'agent_stopped',
            success: true
          }));
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// REST API Endpoints
app.post('/api/initialize-agent', async (req, res) => {
  try {
    const { meetingId, personality, voiceSettings } = req.body;
    
    await aiAgent.initializeMeeting(meetingId, personality);
    
    if (voiceSettings) {
      aiAgent.updateVoiceSettings(voiceSettings);
    }
    
    res.json({
      success: true,
      message: 'AI Agent initialized successfully',
      meetingId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/process-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const audioBuffer = fs.readFileSync(req.file.path);
    const result = await aiAgent.processAudioInput(audioBuffer);
    
    // Clean up temp file
    fs.unlinkSync(req.file.path);
    
    if (result) {
      res.json({
        success: true,
        transcription: result.transcription,
        response: result.response,
        audio: result.audio
      });
    } else {
      res.json({
        success: false,
        message: 'Could not process audio'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/agent-status', (req, res) => {
  res.json({
    isActive: aiAgent.isActive,
    meetingId: aiAgent.currentMeetingId,
    voiceSettings: aiAgent.voiceSettings
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Create temp directory if it doesn't exist
if (!fs.existsSync('./temp')) {
  fs.mkdirSync('./temp');
}

// Start server
server.listen(PORT, () => {
  console.log(`🚀 AI Voice Agent Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`🌐 Frontend should connect to ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, aiAgent };