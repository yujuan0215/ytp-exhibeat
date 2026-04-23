export interface Exhibition {
  id: string;
  title: string;
  price?: string | number;
  dateStr: string;
  location: string;
  aiSummary?: string;
  tags: string[];
  imageUrl: string;
  isFavorite: boolean;
  _meta?: {
    isFree: boolean;
    endDate: string;
    editModifyDate: string;
    score: number;
    latitude?: number;
    longitude?: number;
  };
}

export interface Recommendation {
  id: string;
  title: string;
  tag: string;
  location: string;
  imageUrl: string;
}

export const homeExhibitions: Exhibition[] = [
  {
    id: "e1",
    title: "靜謐之聲 : 抽象聯展",
    price: "NT$ 350",
    dateStr: "2024.11.20 - 2025.01.15",
    location: "台北市立美術館 • 3F",
    aiSummary: "探討孤寂與光影的實驗性對話，適合偏好深度思考與安靜氛圍的藝術愛好者。",
    tags: ["空間步道"],
    imageUrl: "https://images.unsplash.com/photo-1549490349-8643362247b5?w=600&auto=format&fit=crop&q=80",
    isFavorite: false,
  },
  {
    id: "e2",
    title: "霓虹台北 : 巷弄計畫",
    price: "FREE",
    dateStr: "2024.12.01 - 2024.12.31",
    location: "華山 1914 文化創意產業園區",
    aiSummary: "街頭藝術家攜手打造的戶外迷宮，將實體廢棄美學融入傳統紅磚牆。",
    tags: ["限時免費"],
    imageUrl: "https://images.unsplash.com/photo-1514924013411-cbf25faa35bb?w=600&auto=format&fit=crop&q=80",
    isFavorite: true,
  },
  {
    id: "e3",
    title: "觸覺宇宙 : 數位互動",
    price: "NT$ 480",
    dateStr: "長期展出",
    location: "松山文創園區 5 號倉庫",
    aiSummary: "全息光影互動體驗，孩子們可以觸摸光線，大人則能在聲波中療癒自我。",
    tags: ["雨天備案", "親子友善"],
    imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
    isFavorite: false,
  }
];

export const collectionExhibitions: Exhibition[] = [
  {
    id: "c1",
    title: "數位幻境 : 沉浸式光影展",
    dateStr: "2024.05.20 - 06.30",
    location: "台北數位藝術中心",
    tags: ["數位藝術"],
    imageUrl: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=600&auto=format&fit=crop&q=80",
    isFavorite: true,
  },
  {
    id: "c2",
    title: "寂靜之境 : 現代油畫展",
    dateStr: "2024.06.12 - 08.15",
    location: "白石畫廊",
    tags: ["極簡主義"],
    imageUrl: "https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=600&auto=format&fit=crop&q=80",
    isFavorite: true,
  },
  {
    id: "c3",
    title: "台北之夜 : 霓虹攝影特展",
    dateStr: "2024.04.01 - 05.30",
    location: "光點台北",
    tags: ["攝影展"],
    imageUrl: "https://images.unsplash.com/photo-1555529733-0e670560f7e1?w=600&auto=format&fit=crop&q=80",
    isFavorite: true,
  },
  {
    id: "c4",
    title: "破曉之前 : 新銳藝術家聯展",
    dateStr: "2024.07.01 - 08.20",
    location: "華山1914",
    tags: ["當代藝術"],
    imageUrl: "https://images.unsplash.com/photo-1499781350541-7783f6c6a0c8?w=600&auto=format&fit=crop&q=80",
    isFavorite: true,
  }
];

export const recommendations: Recommendation[] = [
  {
    id: "r1",
    title: "電子聲響 : 未來音樂實驗室",
    tag: "基於你的品味",
    location: "松山文創園區",
    imageUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&auto=format&fit=crop&q=60"
  },
  {
    id: "r2",
    title: "構造 : 與空間的對話展",
    tag: "熱門活動",
    location: "台北市立美術館",
    imageUrl: "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=300&auto=format&fit=crop&q=60"
  },
  {
    id: "r3",
    title: "流動意識 : 色彩媒介實驗",
    tag: "新上線",
    location: "忠泰美術館",
    imageUrl: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=300&auto=format&fit=crop&q=60"
  }
];
