// 模拟数据 - 智能座舱多模态交互终端

export const emotionData = {
  currentEmotion: '平静',
  confidence: 0.92,
  faceDetected: true,
  driver: '张三',
  emotionHistory: [
    { time: '14:30:01', emotion: '平静', confidence: 0.92 },
    { time: '14:30:05', emotion: '开心', confidence: 0.78 },
    { time: '14:30:10', emotion: '平静', confidence: 0.88 },
    { time: '14:30:15', emotion: '专注', confidence: 0.85 },
    { time: '14:30:20', emotion: '平静', confidence: 0.91 },
  ],
  driverPreferences: {
    seatTemp: 24,
    ambientLight: '蓝色',
    musicVolume: 35,
    drivingMode: '舒适',
  },
};

export const vehicleData = {
  speed: 72,
  rpm: 2800,
  fuel: 68,
  waterTemp: 88,
  tirePressure: [2.4, 2.5, 2.3, 2.4],
  totalMileage: 45832,
  battery: 82,
  isDriving: true,
  idleTime: 0,
};

export const cabinData = {
  acOn: true,
  acTemp: 24,
  windows: [false, false, false, false],
  seatHeating: false,
  ambientLight: true,
  ambientColor: '#00d4ff',
  drivingMode: 'comfort',
  volume: 35,
};

export const voiceMessages = [
  { role: 'user', text: '导航到最近的加油站', time: '14:28' },
  { role: 'assistant', text: '好的，已为您规划路线。前方2.3公里处有中国石化加油站，预计行驶时间5分钟。', time: '14:28' },
  { role: 'user', text: '播放一些轻松的音乐', time: '14:30' },
  { role: 'assistant', text: '正在为您播放轻音乐合集，当前曲目：《River Flows in You》', time: '14:30' },
  { role: 'user', text: '车内温度有点高', time: '14:32' },
  { role: 'assistant', text: '已为您将空调温度调低至22℃，风量调至中档。', time: '14:32' },
];

export const voiceSettings = {
  roles: ['晓伊・活泼动漫少女', '小明・沉稳男声', '雪儿・温柔女声', '机器人・电子合成音'],
  selectedRole: 0,
  pitchOffset: 0,
  speedOffset: 0,
  styles: ['默认', '新闻播报', '有声读物', '客服模式'],
  selectedStyle: 0,
};

export const safetyData = {
  fatigueScore: 8,
  alertLevel: 'normal',
  eyeClosureRate: 0.03,
  yawnsPerMin: 0,
  gazeDirection: '前方',
  distractionDuration: 0,
  heartRate: 72,
  alerts: [
    { time: '14:25:00', type: 'normal', message: '驾驶状态良好' },
    { time: '14:28:30', type: 'normal', message: '驾驶员状态正常' },
    { time: '14:30:00', type: 'normal', message: '各项指标正常' },
  ],
  dangerBehaviors: [],
};

export const weatherData = {
  city: '北京',
  temperature: 28,
  condition: '晴',
  humidity: 45,
  windSpeed: 12,
  pressure: 1013,
  visibility: 25,
  uvIndex: 6,
  forecast: [
    { day: '明天', temp: 30, condition: '多云', icon: 'cloud' },
    { day: '后天', temp: 27, condition: '小雨', icon: 'cloud-rain' },
    { day: '周四', temp: 25, condition: '阴', icon: 'cloud' },
    { day: '周五', temp: 29, condition: '晴', icon: 'sun' },
    { day: '周六', temp: 31, condition: '晴', icon: 'sun' },
  ],
};

export const modules = [
  {
    id: 'dashboard',
    name: '系统总览',
    path: '/',
    icon: 'LayoutDashboard',
  },
  {
    id: 'emotion',
    name: '表情识别',
    path: '/emotion',
    icon: 'Smile',
  },
  {
    id: 'vehicle',
    name: '车辆仪表',
    path: '/vehicle',
    icon: 'Gauge',
  },
  {
    id: 'cabin',
    name: '座舱控制',
    path: '/cabin',
    icon: 'Settings',
  },
  {
    id: 'voice',
    name: '语音助手',
    path: '/voice',
    icon: 'MessageCircle',
  },
  {
    id: 'safety',
    name: '安全监控',
    path: '/safety',
    icon: 'Shield',
  },
  {
    id: 'weather',
    name: '天气信息',
    path: '/weather',
    icon: 'CloudSun',
  },
];
