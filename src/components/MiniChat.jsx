import { useState, useRef, useEffect } from 'react';
import { Send, Mic, Loader2, MessageCircle, User, Bot, Trash2 } from 'lucide-react';
import { useVoice } from '../context/VoiceStore';
import { useVehicle } from '../context/VehicleStore';
import { api } from '../services/api';
