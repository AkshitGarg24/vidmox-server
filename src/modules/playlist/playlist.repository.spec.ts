import { Test, TestingModule } from '@nestjs/testing';
import { PlaylistRepository, PlaylistLimitError } from './playlist.repository';
import { PrismaService } from '../prisma/prisma.service';
import { PlaylistDto } from './dto/playlist.dto';
import { PLAYLIST_LIMIT } from 'src/configs/constants';

describe('PlaylistRepository', () => {
  let repository: PlaylistRepository;

  const mockUserId = 'user-123';
  const mockPlaylistId = '550e8400-e29b-41d4-a716-446655440000';
  const mockDate = new Date('2025-01-01T00:00:00Z');
  const mockDto: PlaylistDto = {
    name: 'My Playlist',
    description: 'A description',
  };

  const mockPlaylistSummary = {
    id: mockPlaylistId,
    name: 'My Playlist',
    description: 'A description',
    totalVideos: 0,
    createdAt: mockDate,
  };

  const mockPlaylistFull = {
    id: mockPlaylistId,
    userId: mockUserId,
    name: 'My Playlist',
    description: 'A description',
    limit: 10,
    totalVideos: 0,
    createdAt: mockDate,
  };

  const mockTransaction = jest.fn();
  const mockTxCount = jest.fn<Promise<number>, [object]>();
  const mockTxCreate = jest.fn<
    Promise<object>,
    [{ data: Record<string, unknown> }]
  >();
  const mockFindMany = jest.fn<Promise<object[]>, [object]>();
  const mockFindFirst = jest.fn<Promise<object | null>, [object]>();
  const mockUpdate = jest.fn<
    Promise<object>,
    [{ where: Record<string, unknown>; data: Record<string, unknown> }]
  >();
  const mockDelete = jest.fn<
    Promise<object>,
    [{ where: Record<string, unknown> }]
  >();

  const mockPrismaService = {
    $transaction: mockTransaction,
    playlist: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      update: mockUpdate,
      delete: mockDelete,
    },
  };

  function setupTransaction() {
    mockTransaction.mockImplementation(
      (cb: (tx: Record<string, unknown>) => unknown) =>
        cb({ playlist: { count: mockTxCount, create: mockTxCreate } }),
    );
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaylistRepository,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    repository = module.get<PlaylistRepository>(PlaylistRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('createWithinLimit', () => {
    it('should create a playlist when count is under the limit', async () => {
      setupTransaction();
      mockTxCount.mockResolvedValue(PLAYLIST_LIMIT - 1);
      mockTxCreate.mockResolvedValue(mockPlaylistSummary);

      const result = await repository.createWithinLimit(
        mockUserId,
        mockDto,
        PLAYLIST_LIMIT,
      );

      expect(result).toEqual(mockPlaylistSummary);
      expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      expect(mockTxCount).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(mockTxCreate).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          name: mockDto.name,
          description: mockDto.description,
        },
        select: {
          name: true,
          description: true,
          id: true,
          totalVideos: true,
          createdAt: true,
        },
      });
    });

    it('should create a playlist when description is not provided', async () => {
      setupTransaction();
      const dtoNoDesc: PlaylistDto = { name: 'Minimal' };
      const expected = {
        ...mockPlaylistSummary,
        name: 'Minimal',
        description: null,
      };
      mockTxCount.mockResolvedValue(PLAYLIST_LIMIT - 1);
      mockTxCreate.mockResolvedValue(expected);

      const result = await repository.createWithinLimit(
        mockUserId,
        dtoNoDesc,
        PLAYLIST_LIMIT,
      );

      expect(result).toEqual(expected);
      expect(mockTxCreate.mock.calls[0][0]).toHaveProperty(
        'data.name',
        'Minimal',
      );
    });

    it('should throw PlaylistLimitError when count equals the limit', async () => {
      setupTransaction();
      mockTxCount.mockResolvedValue(PLAYLIST_LIMIT);

      await expect(
        repository.createWithinLimit(mockUserId, mockDto, PLAYLIST_LIMIT),
      ).rejects.toThrow(PlaylistLimitError);

      expect(mockTxCount).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(mockTxCreate).not.toHaveBeenCalled();
    });

    it('should throw PlaylistLimitError when count exceeds the limit', async () => {
      setupTransaction();
      mockTxCount.mockResolvedValue(PLAYLIST_LIMIT + 5);

      await expect(
        repository.createWithinLimit(mockUserId, mockDto, PLAYLIST_LIMIT),
      ).rejects.toThrow(PlaylistLimitError);

      expect(mockTxCreate).not.toHaveBeenCalled();
    });

    it('should use the provided limit value', async () => {
      setupTransaction();
      const customLimit = 5;
      mockTxCount.mockResolvedValue(5);

      await expect(
        repository.createWithinLimit(mockUserId, mockDto, customLimit),
      ).rejects.toThrow(PlaylistLimitError);
    });

    it('should propagate transaction errors', async () => {
      const error = new Error('Transaction failed');
      mockTransaction.mockRejectedValue(error);

      await expect(
        repository.createWithinLimit(mockUserId, mockDto, PLAYLIST_LIMIT),
      ).rejects.toThrow(error);
    });
  });

  describe('findAll', () => {
    const secondPlaylist = {
      ...mockPlaylistSummary,
      id: 'playlist-2',
      name: 'Second Playlist',
    };

    it('should return all playlists for the user with projected fields', async () => {
      const playlists = [mockPlaylistSummary, secondPlaylist];
      mockFindMany.mockResolvedValue(playlists);

      const result = await repository.findAll(mockUserId);

      expect(result).toEqual(playlists);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        select: {
          name: true,
          description: true,
          id: true,
          totalVideos: true,
          createdAt: true,
        },
      });
    });

    it('should return an empty array when user has no playlists', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await repository.findAll(mockUserId);

      expect(result).toEqual([]);
    });

    it('should only return playlists scoped to the specified user', async () => {
      mockFindMany.mockResolvedValue([mockPlaylistSummary]);

      await repository.findAll(mockUserId);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUserId },
        }),
      );
    });

    it('should propagate Prisma errors', async () => {
      const error = new Error('Query failed');
      mockFindMany.mockRejectedValue(error);

      await expect(repository.findAll(mockUserId)).rejects.toThrow(error);
    });
  });

  describe('findOne', () => {
    it('should return the projected playlist record when found', async () => {
      mockFindFirst.mockResolvedValue(mockPlaylistSummary);

      const result = await repository.findOne(mockUserId, mockPlaylistId);

      expect(result).toEqual(mockPlaylistSummary);
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { userId: mockUserId, id: mockPlaylistId },
        select: {
          name: true,
          description: true,
          id: true,
          totalVideos: true,
          createdAt: true,
        },
      });
    });

    it('should return null when playlist does not exist', async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await repository.findOne(mockUserId, 'nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return null when playlist belongs to a different user', async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await repository.findOne('other-user', mockPlaylistId);

      expect(result).toBeNull();
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { userId: 'other-user', id: mockPlaylistId },
        select: {
          name: true,
          description: true,
          id: true,
          totalVideos: true,
          createdAt: true,
        },
      });
    });

    it('should propagate Prisma errors', async () => {
      const error = new Error('Query failed');
      mockFindFirst.mockRejectedValue(error);

      await expect(
        repository.findOne(mockUserId, mockPlaylistId),
      ).rejects.toThrow(error);
    });
  });

  describe('update', () => {
    const updatedDto: PlaylistDto = {
      name: 'Updated Name',
      description: 'Updated desc',
    };
    const updatedRecord = {
      ...mockPlaylistFull,
      name: 'Updated Name',
      description: 'Updated desc',
    };

    it('should update name and description for the matching playlist', async () => {
      mockUpdate.mockResolvedValue(updatedRecord);

      const result = await repository.update(
        mockUserId,
        mockPlaylistId,
        updatedDto,
      );

      expect(result).toEqual(updatedRecord);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: mockPlaylistId, userId: mockUserId },
        data: { name: 'Updated Name', description: 'Updated desc' },
      });
    });

    it('should enforce ownership via the compound where clause', async () => {
      mockUpdate.mockResolvedValue(updatedRecord);

      await repository.update(mockUserId, mockPlaylistId, updatedDto);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockPlaylistId, userId: mockUserId },
        }),
      );
    });

    it('should propagate P2025 when no record matches', async () => {
      const error = Object.assign(new Error('Record not found'), {
        code: 'P2025',
      });
      mockUpdate.mockRejectedValue(error);

      await expect(
        repository.update(mockUserId, 'bad-id', updatedDto),
      ).rejects.toThrow(error);
    });

    it('should propagate other Prisma errors', async () => {
      const error = new Error('Update failed');
      mockUpdate.mockRejectedValue(error);

      await expect(
        repository.update(mockUserId, mockPlaylistId, updatedDto),
      ).rejects.toThrow(error);
    });
  });

  describe('delete', () => {
    it('should delete the playlist scoped to user', async () => {
      mockDelete.mockResolvedValue(mockPlaylistFull);

      const result = await repository.delete(mockUserId, mockPlaylistId);

      expect(result).toEqual(mockPlaylistFull);
      expect(mockDelete).toHaveBeenCalledWith({
        where: { id: mockPlaylistId, userId: mockUserId },
      });
    });

    it('should prevent cross-user deletion via the compound where', async () => {
      mockDelete.mockResolvedValue(mockPlaylistFull);

      await repository.delete(mockUserId, mockPlaylistId);

      expect(mockDelete.mock.calls[0][0]).toHaveProperty(
        'where.userId',
        mockUserId,
      );
    });

    it('should propagate P2025 when no record matches', async () => {
      const error = Object.assign(new Error('Record not found'), {
        code: 'P2025',
      });
      mockDelete.mockRejectedValue(error);

      await expect(repository.delete(mockUserId, 'bad-id')).rejects.toThrow(
        error,
      );
    });

    it('should propagate other Prisma errors', async () => {
      const error = new Error('Delete failed');
      mockDelete.mockRejectedValue(error);

      await expect(
        repository.delete(mockUserId, mockPlaylistId),
      ).rejects.toThrow(error);
    });
  });
});
