export type DeliveryChannel = "telegram" | "instagram" | "youtube";

export interface DeliveryPayload {
  videoBuffer: Buffer;
  videoFilePath: string;
  filename: string;
  title: string;
  caption: string;
  hashtags: string[];
}

export interface PublishResult {
  ok: boolean;
  deliveryMethod: DeliveryChannel;
  proofId?: string;
  proofUrl?: string;
  error?: string;
}
