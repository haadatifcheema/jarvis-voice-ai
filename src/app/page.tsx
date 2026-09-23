"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Mic, MicOff, Volume2, VolumeX, Settings, Send, Sparkles, 
  Terminal, ShieldAlert, Cpu, Activity, RefreshCw, Radio, Key, 
  Trash2, User, Bot, Play, Pause, AlertCircle, CheckCircle2 
} from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "jarvis";
  text: string;
  timestamp: string;
}

type JarvisStatus = "Idle" | "Listening..." | "Thinking..." | "Speaking...";

export default function JarvisApp() {
  // State
  const [apiKey, setApiKey] = useState<string>("");
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>("");
  const [status, setStatus] = useState<JarvisStatus>("Idle");
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");
  const [inputText, setInputText] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "jarvis",
      text: "Greetings, Commander. JARVIS AI online and standing by. How may I assist your operations today?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [activeVoiceName, setActiveVoiceName] = useState<string>("");
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [speechPitch, setSpeechPitch] = useState<number>(1.0);
  const [autoListen, setAutoListen] = useState<boolean>(true);

  // Refs
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Load API key & setup speech synth
  useEffect(() => {
    const storedKey = localStorage.getItem("jarvis_gemini_api_key");
    if (storedKey) {
      setApiKey(storedKey);
      setTempApiKey(storedKey);
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis;
      // Load voices
      const updateVoices = () => {
        const voices = synthRef.current?.getVoices() || [];
        // Try to find a good English voice
        const preferred = voices.find(v => v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("English") || v.lang.startsWith("en"));
        if (preferred) {
          setActiveVoiceName(preferred.name);
        } else if (voices.length > 0) {
          setActiveVoiceName(voices[0].name);
        }
      };
      updateVoices();
      synthRef.current.onvoiceschanged = updateVoices;
    }

    // Initialize speech recognition
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => {
          setIsListening(true);
          setStatus("Listening...");
        };

        recognition.onresult = (event: any) => {
          let currentTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsListening(false);
          setStatus("Idle");
        };

        recognition.onend = () => {
          setIsListening(false);
          setStatus("Idle");
          // If we captured a transcript, send it automatically
          if (transcript.trim()) {
            handleUserSubmit(transcript.trim());
          }
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  // Auto scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, transcript]);

  // Save API Key
  const saveApiKey = () => {
    localStorage.setItem("jarvis_gemini_api_key", tempApiKey.trim());
    setApiKey(tempApiKey.trim());
    setShowSettings(false);
  };

  // Toggle Speech Recognition
  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Speech Recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setStatus("Idle");
    } else {
      setTranscript("");
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Speak text using SpeechSynthesis
  const speakText = (text: string) => {
    if (isMuted || !synthRef.current) return;
    
    // Cancel any ongoing speech
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speechRate;
    utterance.pitch = speechPitch;

    const voices = synthRef.current.getVoices();
    const selectedVoice = voices.find(v => v.name === activeVoiceName);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onstart = () => {
      setStatus("Speaking...");
    };

    utterance.onend = () => {
      setStatus("Idle");
      // If auto-listen is enabled after assistant finishes speaking, trigger listening again
      if (autoListen && !isListening) {
        setTimeout(() => {
          try {
            setTranscript("");
            recognitionRef.current?.start();
          } catch (e) {
            // Ignore if already started or permission issue
          }
        }, 500);
      }
    };

    utterance.onerror = () => {
      setStatus("Idle");
    };

    synthRef.current.speak(utterance);
  };

  // Stop current speech
  const stopSpeech = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setStatus("Idle");
    }
  };

  // Call Gemini API
  const queryGemini = async (promptText: string) => {
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    setStatus("Thinking...");

    try {
      // Using gemini-2.5-flash standard REST endpoint
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      
      const systemInstruction = "You are JARVIS, an elite AI assistant. Keep responses clear, concise, and under 3 sentences for natural speech delivery.";

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemInstruction}\n\nUser request: ${promptText}` }]
            }
          ]
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to communicate with Gemini API");
      }

      const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I apologize, Commander, I received an empty transmission from the neural network.";

      const assistantMsg: Message = {
        id: Date.now().toString(),
        sender: "jarvis",
        text: replyText.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMsg]);
      speakText(assistantMsg.text);

    } catch (err: any) {
      console.error(err);
      const errorMsg: Message = {
        id: Date.now().toString(),
        sender: "jarvis",
        text: `Error accessing Gemini core: ${err.message}. Please check your API key in settings.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
      setStatus("Idle");
    }
  };

  // Handle user submit (from voice or text input)
  const handleUserSubmit = (textToSend: string) => {
    if (!textToSend.trim()) return;

    // Stop listening if active
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
    stopSpeech();

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setTranscript("");
    setInputText("");

    queryGemini(textToSend);
  };

  const quickChips = [
    "Tell me a tech joke",
    "Explain Black Holes",
    "What is Python?",
    "System status report",
    "How does quantum computing work?"
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#050B14] text-cyan-400 font-mono selection:bg-cyan-500 selection:text-black overflow-x-hidden relative">
      {/* Cyberpunk Grid Background Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#082f4915_1px,transparent_1px),linear-gradient(to_bottom,#082f4915_1px,transparent_1px)] bg-[size:3rem_3rem] pointer-events-none z-0" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-cyan-600/10 via-purple-600/5 to-transparent rounded-full blur-3xl pointer-events-none z-0" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-cyan-500/20 bg-[#070e1c]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <Cpu className="w-6 h-6 text-cyan-400 animate-pulse" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full animate-ping opacity-75" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-purple-400">
              J.A.R.V.I.S.
            </h1>
            <p className="text-[10px] text-cyan-400/60 uppercase tracking-wider">Advanced AI Neural Interface v2.5</p>
          </div>
        </div>

        {/* Status indicator & Settings */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-950/40 border border-cyan-500/30 text-xs">
            <Activity className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            <span className="text-cyan-400/70">STATUS:</span>
            <span className={`font-bold uppercase tracking-wider ${
              status === "Listening..." ? "text-red-400 animate-pulse" :
              status === "Thinking..." ? "text-yellow-400 animate-pulse" :
              status === "Speaking..." ? "text-green-400 animate-pulse" : "text-cyan-300"
            }`}>
              {status}
            </span>
          </div>

          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-2 rounded-xl border transition-all ${
              isMuted 
                ? "bg-red-950/40 border-red-500/40 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.2)]" 
                : "bg-cyan-950/40 border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
            }`}
            title={isMuted ? "Unmute Voice Output" : "Mute Voice Output"}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          <button
            onClick={() => { setTempApiKey(apiKey); setShowSettings(true); }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/40 transition-all shadow-[0_0_10px_rgba(6,182,212,0.2)] text-xs font-bold"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden md:inline">API CONFIG</span>
          </button>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="relative z-10 flex-1 flex flex-col md:flex-row gap-6 p-4 md:p-6 max-w-7xl mx-auto w-full">
        
        {/* Left / Center Column: Voice Orb & Interactive Center */}
        <div className="flex-1 flex flex-col gap-6">
          
          {/* Cyberpunk Visualizer / Voice Orb Card */}
          <div className="relative flex flex-col items-center justify-center p-8 rounded-2xl bg-[#081123]/80 border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)] backdrop-blur-xl overflow-hidden min-h-[320px]">
            {/* Background glowing ring */}
            <div className={`absolute w-48 h-48 rounded-full transition-all duration-500 ${
              isListening ? "bg-red-500/20 shadow-[0_0_60px_rgba(239,68,68,0.5)] animate-ping" :
              status === "Thinking..." ? "bg-yellow-500/20 shadow-[0_0_60px_rgba(234,179,8,0.5)] animate-pulse" :
              status === "Speaking..." ? "bg-green-500/20 shadow-[0_0_60px_rgba(34,197,94,0.5)] animate-pulse" :
              "bg-cyan-500/10 shadow-[0_0_40px_rgba(6,182,212,0.3)]"
            }`} />

            {/* Glowing Microphone Button */}
            <button
              onClick={toggleListening}
              className={`relative z-20 flex items-center justify-center w-28 h-28 rounded-full border-2 transition-all duration-300 ${
                isListening
                  ? "bg-red-600 border-red-400 text-white shadow-[0_0_40px_rgba(239,68,68,0.8)] scale-110 animate-pulse"
                  : "bg-gradient-to-br from-cyan-950 to-slate-900 border-cyan-400 text-cyan-400 hover:border-cyan-300 hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] hover:scale-105"
              }`}
            >
              {isListening ? (
                <MicOff className="w-12 h-12 animate-bounce" />
              ) : (
                <Mic className="w-12 h-12" />
              )}
            </button>

            {/* Status text under mic */}
            <div className="mt-6 text-center z-20">
              <p className="text-sm tracking-widest uppercase font-semibold text-cyan-300">
                {isListening ? "Listening to your voice..." : "Click mic to speak or use text input"}
              </p>
              {/* Audio Wave Visualizer Simulation */}
              <div className="flex items-center justify-center gap-1.5 h-6 mt-3">
                {[...Array(9)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-all duration-200 ${
                      status === "Speaking..." || isListening || status === "Thinking..."
                        ? "bg-cyan-400 animate-pulse"
                        : "bg-cyan-900"
                    }`}
                    style={{
                      height: (status === "Speaking..." || isListening) ? `${Math.max(8, Math.sin(i + Date.now() / 200) * 24 + 12)}px` : "6px",
                      animationDelay: `${i * 100}ms`
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Real-time transcript box if active */}
            {transcript && (
              <div className="mt-4 w-full max-w-lg p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-sm text-cyan-200 animate-fade-in text-center">
                <span className="text-xs text-cyan-400/60 block uppercase font-bold mb-1">Live Transcript:</span>
                "{transcript}"
              </div>
            )}
          </div>

          {/* Quick Action Chips */}
          <div className="flex flex-col gap-2">
            <span className="text-xs text-cyan-400/60 uppercase tracking-widest font-bold">Quick Diagnostics / Prompts:</span>
            <div className="flex flex-wrap gap-2">
              {quickChips.map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => handleUserSubmit(chip)}
                  className="px-3.5 py-1.5 rounded-lg bg-cyan-950/30 border border-cyan-500/20 text-xs text-cyan-300 hover:bg-cyan-900/50 hover:border-cyan-400 transition-all shadow-[0_0_8px_rgba(6,182,212,0.1)] flex items-center gap-1.5"
                >
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Fallback Text Input Bar */}
          <div className="flex items-center gap-3 p-2 rounded-xl bg-[#081123]/80 border border-cyan-500/30 backdrop-blur-xl shadow-[0_0_15px_rgba(6,182,212,0.1)]">
            <Terminal className="w-5 h-5 text-cyan-400 ml-2 shrink-0" />
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUserSubmit(inputText)}
              placeholder="Type command or question for JARVIS..."
              className="flex-1 bg-transparent text-cyan-200 placeholder-cyan-700 text-sm focus:outline-none px-2"
            />
            {status === "Speaking..." && (
              <button
                onClick={stopSpeech}
                className="px-3 py-2 rounded-lg bg-red-950/60 border border-red-500/40 text-red-400 text-xs hover:bg-red-900/60 transition-all flex items-center gap-1"
                title="Stop Speech"
              >
                <Pause className="w-3.5 h-3.5" /> Stop
              </button>
            )}
            <button
              onClick={() => handleUserSubmit(inputText)}
              className="px-4 py-2.5 rounded-lg bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] flex items-center gap-1.5 text-xs"
            >
              <Send className="w-4 h-4" />
              <span>SEND</span>
            </button>
          </div>

        </div>

        {/* Right Column: Chat History Log */}
        <div className="w-full md:w-[420px] flex flex-col rounded-2xl bg-[#081123]/80 border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)] backdrop-blur-xl overflow-hidden h-[500px] md:h-auto">
          
          <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-cyan-950/20">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-cyan-300">Mission Log & Conversation</span>
            </div>
            <button
              onClick={() => setMessages([{
                id: Date.now().toString(),
                sender: "jarvis",
                text: "Memory cleared. Standing by for new directives, Commander.",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }])}
              className="p-1.5 rounded-lg hover:bg-cyan-900/40 text-cyan-400/70 hover:text-cyan-300 transition-all"
              title="Clear History"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Messages scrollable area */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 custom-scrollbar">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[88%] ${
                  msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-[10px] text-cyan-400/60">
                  {msg.sender === "user" ? (
                    <>
                      <span>Commander</span>
                      <User className="w-3 h-3 text-cyan-400" />
                    </>
                  ) : (
                    <>
                      <Bot className="w-3 h-3 text-cyan-400" />
                      <span>JARVIS</span>
                    </>
                  )}
                  <span>• {msg.timestamp}</span>
                </div>

                <div
                  className={`p-3.5 rounded-xl text-xs md:text-sm leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-cyan-950/80 border border-cyan-500/40 text-cyan-100 shadow-[0_0_10px_rgba(6,182,212,0.15)] rounded-tr-none"
                      : "bg-[#0b1932] border border-cyan-500/20 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.1)] rounded-tl-none"
                  }`}
                >
                  <p>{msg.text}</p>
                </div>

                {msg.sender === "jarvis" && (
                  <button
                    onClick={() => speakText(msg.text)}
                    className="mt-1 flex items-center gap-1 text-[10px] text-cyan-400/60 hover:text-cyan-300 transition-colors"
                  >
                    <Play className="w-3 h-3" /> Replay voice
                  </button>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

        </div>

      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#081123] border border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.3)] p-6 flex flex-col gap-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-cyan-400" />
                <h2 className="text-base font-bold text-cyan-300 tracking-wider">SYSTEM CONFIGURATION</h2>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-cyan-400/60 hover:text-cyan-300 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-xs text-cyan-400/80 font-bold uppercase tracking-wider">
                Google Gemini API Key:
              </label>
              <input
                type="password"
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-cyan-950/50 border border-cyan-500/30 rounded-xl px-4 py-3 text-sm text-cyan-200 placeholder-cyan-700 focus:outline-none focus:border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.1)]"
              />
              <p className="text-[11px] text-cyan-400/60">
                Your key is stored securely in your browser's local storage and used directly for Gemini 2.5 Flash neural queries.
              </p>
            </div>

            <div className="flex flex-col gap-3 border-t border-cyan-500/20 pt-4">
              <label className="text-xs text-cyan-400/80 font-bold uppercase tracking-wider">
                Voice Assistant Settings:
              </label>
              <div className="flex items-center justify-between text-xs text-cyan-300">
                <span>Auto-listen after speaking:</span>
                <input
                  type="checkbox"
                  checked={autoListen}
                  onChange={(e) => setAutoListen(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1.5 mt-2">
                <span className="text-[11px] text-cyan-400/70">Speech Rate: {speechRate}x</span>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.1"
                  value={speechRate}
                  onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  className="accent-cyan-500 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-cyan-500/20">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 rounded-xl border border-cyan-500/30 text-cyan-400 text-xs hover:bg-cyan-950/40"
              >
                Cancel
              </button>
              <button
                onClick={saveApiKey}
                className="px-5 py-2 rounded-xl bg-cyan-500 text-black font-bold text-xs hover:bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
