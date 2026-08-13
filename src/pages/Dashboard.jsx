import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, Car, Heart, ThermometerSun, MessageCircle, User, Bot } from 'lucide-react';
import { useVehicle } from '../context/VehicleStore';
import { useVoice } from '../context/VoiceStore';

export default function Dashboard() {
  const navigate = useNavigate();
  const { vehicle, safety, weather } = useVehicle();
  const { messages } = useVoice();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Dashboard</h1>
        <p>{time.toLocaleTimeString()}</p>
      </header>
      <section className="vehicle-section">
        <Car size={48} />
        <span>{vehicle}</span>
      </section>
      <section className="safety-section">
        <Heart size={48} />
        <span>{safety ? 'Safe' : 'Unsafe'}</span>
      </section>
      <section className="weather-section">
        <ThermometerSun size={48} />
        <span>{weather}</span>
      </section>
      <section className="messages-section">
        <MessageCircle size={48} />
        <ul>
          {messages.map(m => <li key={m.id}>{m.text}</li>)}
        </ul>
      </section>
      <button onClick={() => navigate('/chat')}>Open Chat</button>
    </div>
  );
}
