import { PlaylistService } from './playlist.service';
import { PlaylistRepository, PlaylistLimitError } from './playlist.repository';
import { PlaylistDto } from './dto/playlist.dto';
import { PLAYLIST_LIMIT } from 'src/configs/constants';
import {
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

jest.mock('generated/prisma/client', () => {
  class MockPrismaClient {
    $on() {}
    $connect() {}
    $disconnect() {}
  }

  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(
      message: string,
      opts: { code: string; clientVersion: string },
    ) {
      super(message);
      this.code = opts.code;
    }
  }

  return {
    PrismaClient: MockPrismaClient,
    Prisma: {
      PrismaClientKnownRequestError,
    },
  };
});

import { Prisma } from 'generated/prisma/client';

describe('PlaylistService', () => {
  let service: PlaylistService;

  const mockUserId = 'user-123';
  const mockPlaylistId = '550e8400-e29b-41d4-a716-446655440000';
  const mockDate = new Date('2025-01-01T00:00:00Z');
  const mockDto: PlaylistDto = {
    name: 'My Playlist',
    description: 'A description',
  };

  const mockPlaylistRecord = {
    id: mockPlaylistId,
    name: 'My Playlist',
    description: 'A description',
    totalVideos: 0,
    createdAt: mockDate,
  };

  const createWithinLimit = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const update = jest.fn();
  const deleteFn = jest.fn();

  const mockRepository = {
    createWithinLimit,
    findAll,
    findOne,
    update,
    delete: deleteFn,
  } as unknown as jest.Mocked<PlaylistRepository>;

  let loggerLogSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => {});
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    service = new PlaylistService(mockRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a playlist when the repository succeeds', async () => {
      createWithinLimit.mockResolvedValue(mockPlaylistRecord);

      const result = await service.create(mockUserId, mockDto);

      expect(result).toEqual(mockPlaylistRecord);
      expect(createWithinLimit).toHaveBeenCalledWith(
        mockUserId,
        mockDto,
        PLAYLIST_LIMIT,
      );
    });

    it('should throw ForbiddenException when PlaylistLimitError is thrown', async () => {
      createWithinLimit.mockRejectedValue(new PlaylistLimitError());

      await expect(service.create(mockUserId, mockDto)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.create(mockUserId, mockDto)).rejects.toThrow(
        'Playlist limit reached',
      );
    });

    it('should log a message when the limit is reached', async () => {
      createWithinLimit.mockRejectedValue(new PlaylistLimitError());

      await expect(service.create(mockUserId, mockDto)).rejects.toThrow(
        ForbiddenException,
      );

      expect(loggerLogSpy).toHaveBeenCalledWith(
        `Playlist limit reached for user ${mockUserId}`,
      );
    });

    it('should propagate other errors directly', async () => {
      const error = new Error('Database connection failed');
      createWithinLimit.mockRejectedValue(error);

      await expect(service.create(mockUserId, mockDto)).rejects.toThrow(error);
    });
  });

  describe('findAll', () => {
    it('should return all playlists for the user', async () => {
      const playlists = [mockPlaylistRecord];
      findAll.mockResolvedValue(playlists);

      const result = await service.findAll(mockUserId);

      expect(result).toEqual(playlists);
      expect(findAll).toHaveBeenCalledWith(mockUserId);
    });

    it('should return an empty array when user has no playlists', async () => {
      findAll.mockResolvedValue([]);

      const result = await service.findAll(mockUserId);

      expect(result).toEqual([]);
    });

    it('should throw InternalServerErrorException on unexpected error', async () => {
      const error = new Error('Unexpected DB error');
      findAll.mockRejectedValue(error);

      await expect(service.findAll(mockUserId)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.findAll(mockUserId)).rejects.toThrow(
        'Something went wrong',
      );
    });

    it('should log the error on failure', async () => {
      const error = new Error('Unexpected DB error');
      findAll.mockRejectedValue(error);

      await expect(service.findAll(mockUserId)).rejects.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error fetching playlists for user ${mockUserId}`,
        error,
      );
    });
  });

  describe('findOne', () => {
    it('should return the playlist when found', async () => {
      findOne.mockResolvedValue(mockPlaylistRecord);

      const result = await service.findOne(mockUserId, mockPlaylistId);

      expect(result).toEqual(mockPlaylistRecord);
      expect(findOne).toHaveBeenCalledWith(mockUserId, mockPlaylistId);
    });

    it('should throw NotFoundException when playlist is null', async () => {
      findOne.mockResolvedValue(null);

      await expect(service.findOne(mockUserId, mockPlaylistId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(mockUserId, mockPlaylistId)).rejects.toThrow(
        'Playlist not found',
      );
    });

    it('should re-throw NotFoundException directly without wrapping', async () => {
      findOne.mockResolvedValue(null);

      await expect(service.findOne(mockUserId, mockPlaylistId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw InternalServerErrorException on unexpected error', async () => {
      const error = new Error('Unexpected error');
      findOne.mockRejectedValue(error);

      await expect(service.findOne(mockUserId, mockPlaylistId)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should log unexpected errors', async () => {
      const error = new Error('Unexpected error');
      findOne.mockRejectedValue(error);

      await expect(
        service.findOne(mockUserId, mockPlaylistId),
      ).rejects.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error fetching playlist ${mockPlaylistId} for user ${mockUserId}`,
        error,
      );
    });
  });

  describe('update', () => {
    const updatedRecord = { ...mockPlaylistRecord, name: 'Updated' };

    it('should update and return the playlist', async () => {
      update.mockResolvedValue(updatedRecord);

      const result = await service.update(mockUserId, mockPlaylistId, {
        name: 'Updated',
      });

      expect(result).toEqual(updatedRecord);
      expect(update).toHaveBeenCalledWith(mockUserId, mockPlaylistId, {
        name: 'Updated',
      });
    });

    it('should throw NotFoundException on Prisma P2025 error', async () => {
      const p2025Error = new Prisma.PrismaClientKnownRequestError(
        'Record to update not found',
        { code: 'P2025', clientVersion: '5.22.0' },
      );
      update.mockRejectedValue(p2025Error);

      await expect(
        service.update(mockUserId, 'bad-id', { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException on non-P2025 Prisma errors', async () => {
      const otherError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation',
        { code: 'P2002', clientVersion: '5.22.0' },
      );
      update.mockRejectedValue(otherError);

      await expect(
        service.update(mockUserId, mockPlaylistId, { name: 'x' }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should log unexpected errors', async () => {
      const error = new Error('Unexpected error');
      update.mockRejectedValue(error);

      await expect(
        service.update(mockUserId, mockPlaylistId, { name: 'x' }),
      ).rejects.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error updating playlist ${mockPlaylistId} for user ${mockUserId}`,
        error,
      );
    });
  });

  describe('delete', () => {
    it('should delete and return the playlist', async () => {
      deleteFn.mockResolvedValue(mockPlaylistRecord);

      const result = await service.delete(mockUserId, mockPlaylistId);

      expect(result).toEqual(mockPlaylistRecord);
      expect(deleteFn).toHaveBeenCalledWith(mockUserId, mockPlaylistId);
    });

    it('should throw NotFoundException on Prisma P2025 error', async () => {
      const p2025Error = new Prisma.PrismaClientKnownRequestError(
        'Record to delete not found',
        { code: 'P2025', clientVersion: '5.22.0' },
      );
      deleteFn.mockRejectedValue(p2025Error);

      await expect(service.delete(mockUserId, 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw InternalServerErrorException on non-P2025 Prisma errors', async () => {
      const otherError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint',
        { code: 'P2003', clientVersion: '5.22.0' },
      );
      deleteFn.mockRejectedValue(otherError);

      await expect(service.delete(mockUserId, mockPlaylistId)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should log unexpected errors', async () => {
      const error = new Error('Unexpected error');
      deleteFn.mockRejectedValue(error);

      await expect(
        service.delete(mockUserId, mockPlaylistId),
      ).rejects.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error deleting playlist ${mockPlaylistId} for user ${mockUserId}`,
        error,
      );
    });
  });
});
