/** 城市节点数据（经纬度，WGS84）。rank: 1 = 主要枢纽（更大光点、更多航线） */
export interface City {
  id: string
  zh: string
  en: string
  lat: number
  lon: number
  rank: 1 | 2 | 3
}

export const CITIES: City[] = [
  { id: 'shanghai', zh: '上海', en: 'Shanghai', lat: 31.23, lon: 121.47, rank: 1 },
  { id: 'beijing', zh: '北京', en: 'Beijing', lat: 39.9, lon: 116.4, rank: 2 },
  { id: 'hongkong', zh: '香港', en: 'Hong Kong', lat: 22.32, lon: 114.17, rank: 2 },
  { id: 'tokyo', zh: '东京', en: 'Tokyo', lat: 35.68, lon: 139.69, rank: 1 },
  { id: 'seoul', zh: '首尔', en: 'Seoul', lat: 37.57, lon: 126.98, rank: 2 },
  { id: 'singapore', zh: '新加坡', en: 'Singapore', lat: 1.35, lon: 103.82, rank: 1 },
  { id: 'bangkok', zh: '曼谷', en: 'Bangkok', lat: 13.76, lon: 100.5, rank: 2 },
  { id: 'jakarta', zh: '雅加达', en: 'Jakarta', lat: -6.21, lon: 106.85, rank: 2 },
  { id: 'newdelhi', zh: '新德里', en: 'New Delhi', lat: 28.61, lon: 77.21, rank: 2 },
  { id: 'mumbai', zh: '孟买', en: 'Mumbai', lat: 19.08, lon: 72.88, rank: 2 },
  { id: 'dubai', zh: '迪拜', en: 'Dubai', lat: 25.2, lon: 55.27, rank: 1 },
  { id: 'istanbul', zh: '伊斯坦布尔', en: 'Istanbul', lat: 41.01, lon: 28.98, rank: 2 },
  { id: 'moscow', zh: '莫斯科', en: 'Moscow', lat: 55.76, lon: 37.62, rank: 2 },
  { id: 'london', zh: '伦敦', en: 'London', lat: 51.51, lon: -0.13, rank: 1 },
  { id: 'paris', zh: '巴黎', en: 'Paris', lat: 48.86, lon: 2.35, rank: 1 },
  { id: 'berlin', zh: '柏林', en: 'Berlin', lat: 52.52, lon: 13.4, rank: 2 },
  { id: 'cairo', zh: '开罗', en: 'Cairo', lat: 30.04, lon: 31.24, rank: 2 },
  { id: 'lagos', zh: '拉各斯', en: 'Lagos', lat: 6.52, lon: 3.38, rank: 2 },
  { id: 'nairobi', zh: '内罗毕', en: 'Nairobi', lat: -1.29, lon: 36.82, rank: 3 },
  { id: 'johannesburg', zh: '约翰内斯堡', en: 'Johannesburg', lat: -26.2, lon: 28.05, rank: 2 },
  { id: 'capetown', zh: '开普敦', en: 'Cape Town', lat: -33.92, lon: 18.42, rank: 3 },
  { id: 'sydney', zh: '悉尼', en: 'Sydney', lat: -33.87, lon: 151.21, rank: 1 },
  { id: 'auckland', zh: '奥克兰', en: 'Auckland', lat: -36.85, lon: 174.76, rank: 3 },
  { id: 'losangeles', zh: '洛杉矶', en: 'Los Angeles', lat: 34.05, lon: -118.24, rank: 1 },
  { id: 'sanfrancisco', zh: '旧金山', en: 'San Francisco', lat: 37.77, lon: -122.42, rank: 2 },
  { id: 'newyork', zh: '纽约', en: 'New York', lat: 40.71, lon: -74.01, rank: 1 },
  { id: 'chicago', zh: '芝加哥', en: 'Chicago', lat: 41.88, lon: -87.63, rank: 2 },
  { id: 'toronto', zh: '多伦多', en: 'Toronto', lat: 43.65, lon: -79.38, rank: 2 },
  { id: 'mexicocity', zh: '墨西哥城', en: 'Mexico City', lat: 19.43, lon: -99.13, rank: 2 },
  { id: 'saopaulo', zh: '圣保罗', en: 'São Paulo', lat: -23.55, lon: -46.63, rank: 2 },
  { id: 'buenosaires', zh: '布宜诺斯艾利斯', en: 'Buenos Aires', lat: -34.6, lon: -58.38, rank: 2 },
  { id: 'lima', zh: '利马', en: 'Lima', lat: -12.05, lon: -77.04, rank: 3 },
  { id: 'santiago', zh: '圣地亚哥', en: 'Santiago', lat: -33.45, lon: -70.67, rank: 3 },
]

export const CITY_INDEX: Record<string, number> = {}
CITIES.forEach((c, i) => (CITY_INDEX[c.id] = i))
