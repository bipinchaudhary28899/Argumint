import { Server } from "socket.io";
import Redis from "ioredis";

export interface TurnQueueEntry {
  userId: string;
  username: string;
  timestamp: number;
}

export class TurnManagerService {
  private io: Server;
  private redisClient: Redis | null;
  private readonly QUEUE_PREFIX = "debate:queue:";
  private readonly COOLDOWN_PREFIX = "debate:cooldown:";
  private readonly COOLDOWN_DURATION = 5000; // 5 seconds

  constructor(io: Server, redisClient: Redis | null) {
    this.io = io;
    this.redisClient = redisClient;
  }

  /**
   * Add user to mic queue for a debate
   * Returns position in queue
   */
  async addToQueue(debateId: string, userId: string, username: string): Promise<number> {
    const queueKey = `${this.QUEUE_PREFIX}${debateId}`;

    if (this.redisClient) {
      // Store in Redis with timestamp
      const entry: TurnQueueEntry = { userId, username, timestamp: Date.now() };
      const queue = await this.redisClient.lrange(queueKey, 0, -1);

      // Check if user already in queue
      for (const item of queue) {
        const parsed = JSON.parse(item);
        if (parsed.userId === userId) {
          throw new Error("Already in queue");
        }
      }

      await this.redisClient.rpush(queueKey, JSON.stringify(entry));
      const position = await this.redisClient.llen(queueKey);

      // Set expiration for queue (15 minutes of inactivity)
      await this.redisClient.expire(queueKey, 900);

      return position;
    } else {
      // Fallback: in-memory queue (not suitable for production)
      throw new Error("Redis client not available");
    }
  }

  /**
   * Get next user from queue
   * Returns the next user to speak
   */
  async getNextFromQueue(debateId: string): Promise<TurnQueueEntry | null> {
    const queueKey = `${this.QUEUE_PREFIX}${debateId}`;

    if (this.redisClient) {
      const next = await this.redisClient.lpop(queueKey);
      if (next) {
        return JSON.parse(next) as TurnQueueEntry;
      }
    }

    return null;
  }

  /**
   * Remove user from queue (if they decide not to speak)
   */
  async removeFromQueue(debateId: string, userId: string): Promise<boolean> {
    const queueKey = `${this.QUEUE_PREFIX}${debateId}`;

    if (this.redisClient) {
      const queue = await this.redisClient.lrange(queueKey, 0, -1);

      for (let i = 0; i < queue.length; i++) {
        const parsed = JSON.parse(queue[i]);
        if (parsed.userId === userId) {
          await this.redisClient.lrem(queueKey, 1, queue[i]);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get current queue state
   */
  async getQueueState(debateId: string): Promise<TurnQueueEntry[]> {
    const queueKey = `${this.QUEUE_PREFIX}${debateId}`;

    if (this.redisClient) {
      const queue = await this.redisClient.lrange(queueKey, 0, -1);
      return queue.map((item) => JSON.parse(item));
    }

    return [];
  }

  /**
   * Set user on cooldown after they speak
   * They can't reclaim mic during cooldown period
   */
  async setCooldown(debateId: string, userId: string): Promise<void> {
    const cooldownKey = `${this.COOLDOWN_PREFIX}${debateId}:${userId}`;

    if (this.redisClient) {
      // Set cooldown flag that expires after 5 seconds
      await this.redisClient.setex(cooldownKey, 5, "true");
    }
  }

  /**
   * Check if user is on cooldown
   */
  async isOnCooldown(debateId: string, userId: string): Promise<boolean> {
    const cooldownKey = `${this.COOLDOWN_PREFIX}${debateId}:${userId}`;

    if (this.redisClient) {
      const cooldownStatus = await this.redisClient.get(cooldownKey);
      return cooldownStatus === "true";
    }

    return false;
  }

  /**
   * Clear entire queue for a debate (e.g., when debate ends)
   */
  async clearQueue(debateId: string): Promise<void> {
    const queueKey = `${this.QUEUE_PREFIX}${debateId}`;

    if (this.redisClient) {
      await this.redisClient.del(queueKey);
    }
  }

  /**
   * Notify all users about mic availability
   * Called after someone finishes speaking
   */
  async notifyMicAvailable(roomId: string, debateId: string): Promise<void> {
    const queueState = await this.getQueueState(debateId);

    this.io.to(`room:${roomId}`).emit("debate:mic-available", {
      debateId,
      queueLength: queueState.length,
      nextInQueue: queueState[0] || null,
      cooldownDuration: this.COOLDOWN_DURATION,
    });
  }

  /**
   * Start countdown timer for mic availability
   * Notifies room that in 5 seconds, someone can claim the mic
   */
  startMicCountdown(
    roomId: string,
    debateId: string,
    onCountdownEnd: () => void
  ): NodeJS.Timeout {
    const countdownInterval = setInterval(() => {
      this.io.to(`room:${roomId}`).emit("debate:mic-countdown", {
        debateId,
        remainingSeconds: 5,
      });
    }, 1000);

    const timeout = setTimeout(() => {
      clearInterval(countdownInterval);
      onCountdownEnd();
    }, this.COOLDOWN_DURATION);

    return timeout;
  }
}
