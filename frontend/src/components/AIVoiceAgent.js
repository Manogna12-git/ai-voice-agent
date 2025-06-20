import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Settings, Play, Square, Volume2 } from 'lucide-react';

const AIVoiceAgent = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAgentActive, setIsAgentActive] = useState(false);
  const [currentTranscription, setCurrentTranscription] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [conversationLog, setConversationLog] = useState([]);
  const [meetingId, setMeetingId] = useState('');
  const [agentPersonality, setAgentPersonality] = useState('Professional and helpful assistant');
  const [voiceSettings, setVoiceSettings] = useState({
    voice: 'en-US-Neural2-F',
    speed: 1.0,
    pitch: 0.0
  });
  const [showSettings, setShowSettings] = useState(false);

  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Initialize WebSocket connection
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    wsRef.current = new WebSocket('ws://localhost:3001');
    
    wsRef.current.onopen = () => {
      setIsConnected(true);
      console.log('Connected to AI Voice Agent server');
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };

    wsRef.current.onclose = () => {
      setIsConnected(false);
      console.log('Disconnected from server');
      // Attempt to reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  };

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'meeting_initialized':
        setIsAgentActive(true);
        addToConversationLog('System', 'AI Agent initialized for meeting');
        break;
      
      case 'ai_response':
        setCurrentTranscription(data.transcription);
        setAiResponse(data.response);
        addToConversationLog('Human', data.transcription);
        addToConversationLog('AI Agent', data.response);
        
        // Play AI response audio
        if (data.audio) {
          playAudioResponse(data.audio);
        }
        break;
      
      case 'agent_stopped':
        setIsAgentActive(false);
        addToConversationLog('System', 'AI Agent stopped');
        break;
      
      case 'error':
        console.error('Server error:', data.message);
        addToConversationLog('System', `Error: ${data.message}`);
        break;
    }
  };

  const addToConversationLog = (speaker, message) => {
    const timestamp = new Date().toLocaleTimeString();
    setConversationLog(prev => [...prev, { speaker, message, timestamp }]);
  };

  const initializeAgent = () => {
    if (!meetingId.trim()) {
      alert('Please enter a meeting ID');
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'init_meeting',
        meetingId: meetingId,
        personality: agentPersonality
      }));
    }
  };

  const stopAgent = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'stop_agent'
      }));
    }
    stopRecording();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      audioContextRef.current = new AudioContext();
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        processAudio(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);

      // Auto-stop after 10 seconds (you can adjust this)
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          stopRecording();
        }
      }, 10000);

    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const processAudio = async (audioBlob) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const audioData = reader.result.split(',')[1]; // Remove data URL prefix
        
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'audio_data',
            audio: audioData
          }));
        }
      };
      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error('Error processing audio:', error);
    }
  };

  const playAudioResponse = (base64Audio) => {
    try {
      const audioData = atob(base64Audio);
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      
      for (let i = 0; i < audioData.length; i++) {
        uint8Array[i] = audioData.charCodeAt(i);
      }
      
      const audioBlob = new Blob([arrayBuffer], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.play().catch(error => {
        console.error('Error playing audio:', error);
      });
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };
    } catch (error) {
      console.error('Error playing audio response:', error);
    }
  };

  const updateVoiceSettings = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update_voice',
        settings: voiceSettings
      }));
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-lg mb-6">
        <h1 className="text-3xl font-bold mb-2">AI Voice Agent</h1>
        <p className="text-blue-100">Human-like AI assistant for Zoom meetings</p>
      </div>

      {/* Connection Status */}
      <div className="mb-6 p-4 rounded-lg bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="font-medium">
              {isConnected ? 'Connected to Server' : 'Disconnected'}
            </span>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h3 className="font-semibold mb-4">Agent Settings</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Agent Personality</label>
              <textarea
                value={agentPersonality}
                onChange={(e) => setAgentPersonality(e.target.value)}
                className="w-full p-2 border rounded-lg"
                rows="3"
                placeholder="Describe how the AI should behave..."
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Voice</label>
                <select
                  value={voiceSettings.voice}
                  onChange={(e) => setVoiceSettings(prev => ({ ...prev, voice: e.target.value }))}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="en-US-Neural2-F">Female (US)</option>
                  <option value="en-US-Neural2-M">Male (US)</option>
                  <option value="en-GB-Neural2-F">Female (UK)</option>
                  <option value="en-GB-Neural2-M">Male (UK)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Speed</label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={voiceSettings.speed}
                  onChange={(e) => setVoiceSettings(prev => ({ ...prev, speed: parseFloat(e.target.value) }))}
                  className="w-full"
                />
                <span className="text-sm text-gray-600">{voiceSettings.speed}x</span>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Pitch</label>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="1"
                  value={voiceSettings.pitch}
                  onChange={(e) => setVoiceSettings(prev => ({ ...prev, pitch: parseInt(e.target.value) }))}
                  className="w-full"
                />
                <span className="text-sm text-gray-600">{voiceSettings.pitch}</span>
              </div>
            </div>
            
            <button
              onClick={updateVoiceSettings}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Update Voice Settings
            </button>
          </div>
        </div>
      )}

      {/* Meeting Controls */}
      <div className="mb-6 p-4 border rounded-lg">
        <h3 className="font-semibold mb-4">Meeting Controls</h3>
        
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2">Meeting ID</label>
            <input
              type="text"
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              className="w-full p-2 border rounded-lg"
              placeholder="Enter Zoom meeting ID"
              disabled={isAgentActive}
            />
          </div>
          
          <div className="flex gap-2">
            {!isAgentActive ? (
              <button
                onClick={initializeAgent}
                disabled={!isConnected}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
              >
                <Phone className="w-4 h-4" />
                <span>Start Agent</span>
              </button>
            ) : (
              <button
                onClick={stopAgent}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Stop Agent</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Audio Controls */}
      {isAgentActive && (
        <div className="mb-6 p-4 border rounded-lg">
          <h3 className="font-semibold mb-4">Audio Controls</h3>
          
          <div className="flex justify-center">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
              >
                <Mic className="w-5 h-5" />
                <span>Start Listening</span>
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex items-center space-x-2 px-6 py-3 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors animate-pulse"
              >
                <MicOff className="w-5 h-5" />
                <span>Stop Listening</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Current Status */}
      {(currentTranscription || aiResponse) && (
        <div className="mb-6 p-4 border rounded-lg bg-blue-50">
          <h3 className="font-semibold mb-2">Current Interaction</h3>
          
          {currentTranscription && (
            <div className="mb-3">
              <div className="text-sm font-medium text-gray-600 mb-1">You said:</div>
              <div className="p-2 bg-white rounded border">{currentTranscription}</div>
            </div>
          )}
          
          {aiResponse && (
            <div>
              <div className="text-sm font-medium text-gray-600 mb-1">AI Response:</div>
              <div className="p-2 bg-white rounded border flex items-start justify-between">
                <span>{aiResponse}</span>
                <Volume2 className="w-4 h-4 text-blue-600 ml-2 flex-shrink-0" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conversation Log */}
      <div className="border rounded-lg">
        <h3 className="font-semibold p-4 border-b">Conversation Log</h3>
        
        <div className="h-64 overflow-y-auto p-4 space-y-3">
          {conversationLog.length === 0 ? (
            <div className="text-gray-500 text-center">No conversation yet</div>
          ) : (
            conversationLog.map((entry, index) => (
              <div key={index} className={`p-3 rounded-lg ${
                entry.speaker === 'AI Agent' ? 'bg-blue-100 ml-4' : 
                entry.speaker === 'Human' ? 'bg-green-100 mr-4' : 
                'bg-gray-100'
              }`}>
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-sm">{entry.speaker}</span>
                  <span className="text-xs text-gray-500">{entry.timestamp}</span>
                </div>
                <div className="text-sm">{entry.message}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h4 className="font-semibold text-yellow-800 mb-2">How to Use:</h4>
        <ol className="text-sm text-yellow-700 space-y-1">
          <li>1. Configure agent settings and personality if needed</li>
          <li>2. Enter your Zoom meeting ID</li>
          <li>3. Click "Start Agent" to initialize</li>
          <li>4. Use "Start Listening" to capture audio input</li>
          <li>5. The AI will respond with human-like voice</li>
          <li>6. View conversation history in the log below</li>
        </ol>
      </div>
    </div>
  );
};

export default AIVoiceAgent;