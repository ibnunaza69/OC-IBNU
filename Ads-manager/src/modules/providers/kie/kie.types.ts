export interface KieTaskCreateResponse {
  code: number;
  msg: string;
  data?: {
    taskId?: string;
  };
}

export interface KieTaskDetailResponse {
  code: number;
  msg: string;
  data?: {
    taskId: string;
    status?: string;
    successFlag?: number;
    progress?: string;
    errorCode?: number | null;
    errorMessage?: string | null;
    response?: {
      resultUrls?: string[];
      result_urls?: string[];
    } | null;
  };
}

export interface KieRunwayVideoCreateResponse {
  code: number;
  msg: string;
  data?: {
    taskId?: string;
  };
}

export interface KieRunwayVideoDetailResponse {
  code: number;
  msg: string;
  data?: {
    taskId: string;
    parentTaskId?: string;
    state?: 'wait' | 'queueing' | 'generating' | 'success' | 'fail' | string;
    generateTime?: string;
    failCode?: number | null;
    failMsg?: string | null;
    expireFlag?: number | null;
    generateParam?: {
      prompt?: string;
      imageUrl?: string;
      expandPrompt?: boolean;
    } | null;
    videoInfo?: {
      videoId?: string;
      taskId?: string;
      videoUrl?: string;
      imageUrl?: string;
    } | null;
  };
}
