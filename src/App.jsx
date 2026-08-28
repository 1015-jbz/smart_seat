import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { VehicleProvider } from './context/VehicleStore';
import { VoiceProvider } from './context/VoiceStore';
import { MusicProvider } from './context/MusicStore';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import EmotionRecognition from './pages/EmotionRecognition';
import VehicleDashboard from './pages/VehicleDashboard';
import CabinControl from './pages/CabinControl';
import VoiceAssistant from './pages/VoiceAssistant';
import DrivingSafety from './pages/DrivingSafety';
import Weather from './pages/Weather';
import MusicPlayer from './pages/MusicPlayer';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <ThemeProvider>
      <VehicleProvider>
        <VoiceProvider>
          <MusicProvider>
            <HashRouter>
            <ErrorBoundary>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/emotion" element={<EmotionRecognition />} />
                  <Route path="/vehicle" element={<VehicleDashboard />} />
                  <Route path="/cabin" element={<CabinControl />} />
                  <Route path="/voice" element={<VoiceAssistant />} />
                  <Route path="/music" element={<MusicPlayer />} />
                  <Route path="/safety" element={<DrivingSafety />} />
                  <Route path="/weather" element={<Weather />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </ErrorBoundary>
            </HashRouter>
          </MusicProvider>
        </VoiceProvider>
      </VehicleProvider>
    </ThemeProvider>
  );
}
