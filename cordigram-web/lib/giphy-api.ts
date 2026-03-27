// Giphy API Service
const GIPHY_API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || "";
const GIPHY_BASE_URL = "https://api.giphy.com/v1";

export interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_height: {
      url: string;
      width: string;
      height: string;
    };
    fixed_height_small: {
      url: string;
      width: string;
      height: string;
    };
    original: {
      url: string;
      width: string;
      height: string;
    };
    downsized: {
      url: string;
      width: string;
      height: string;
    };
  };
  url: string;
}

export interface GiphySearchResponse {
  data: GiphyGif[];
  pagination: {
    total_count: number;
    count: number;
    offset: number;
  };
}

/**
 * Search GIFs from Giphy
 */
export async function searchGifs(
  query: string,
  limit: number = 20,
  offset: number = 0,
): Promise<GiphySearchResponse> {
  try {
    const url = `${GIPHY_BASE_URL}/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=g&lang=en`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Giphy API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to search GIFs:", error);
    throw error;
  }
}

/**
 * Get trending GIFs from Giphy
 */
export async function getTrendingGifs(
  limit: number = 20,
  offset: number = 0,
): Promise<GiphySearchResponse> {
  try {
    const url = `${GIPHY_BASE_URL}/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=g`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Giphy API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to get trending GIFs:", error);
    throw error;
  }
}

/**
 * Search Stickers from Giphy
 */
export async function searchStickers(
  query: string,
  limit: number = 20,
  offset: number = 0,
): Promise<GiphySearchResponse> {
  try {
    const url = `${GIPHY_BASE_URL}/stickers/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=g&lang=en`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Giphy API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to search stickers:", error);
    throw error;
  }
}

/**
 * Get trending Stickers from Giphy
 */
export async function getTrendingStickers(
  limit: number = 20,
  offset: number = 0,
): Promise<GiphySearchResponse> {
  try {
    const url = `${GIPHY_BASE_URL}/stickers/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=g`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Giphy API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to get trending stickers:", error);
    throw error;
  }
}

/**
 * Get a random wave/hello sticker from Giphy search results
 */
export async function getRandomWaveSticker(): Promise<GiphyGif | null> {
  const queries = ["wave hello", "hi wave", "waving hand"];
  for (const q of queries) {
    try {
      const result = await searchStickers(q, 25, 0);
      if (result.data.length > 0) {
        return result.data[Math.floor(Math.random() * result.data.length)];
      }
    } catch {
      // try next query
    }
  }
  return null;
}

/**
 * Get GIF by ID
 */
export async function getGifById(id: string): Promise<GiphyGif> {
  try {
    const url = `${GIPHY_BASE_URL}/gifs/${id}?api_key=${GIPHY_API_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Giphy API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error("Failed to get GIF by ID:", error);
    throw error;
  }
}
