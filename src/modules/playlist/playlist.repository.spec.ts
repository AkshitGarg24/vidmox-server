import { Test, TestingModule } from '@nestjs/testing';
import { PlaylistRepository } from './playlist.repository';
import { PrismaService } from '../prisma/prisma.service';
import { PlaylistDto } from './dto/playlist.dto';

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

  const mockCount = jest.fn<Promise<number>, [object]>();
  const mockCreate = jest.fn<
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
    playlist: {
      count: mockCount,
      create: mockCreate,
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      update: mockUpdate,
      delete: mockDelete,
    },
  };

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

  describe('count', () => {
    it('should return the number of playlists for a user', async () => {
      mockCount.mockResolvedValue(3);

      const result = await repository.count(mockUserId);

      expect(result).toBe(3);
      expect(mockCount).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
    });

    it('should return 0 when user has no playlists', async () => {
      mockCount.mockResolvedValue(0);

      const result = await repository.count(mockUserId);

      expect(result).toBe(0);
    });

    it('should propagate Prisma errors', async () => {
      const error = new Error('Database connection failed');
      mockCount.mockRejectedValue(error);

      await expect(repository.count(mockUserId)).rejects.toThrow(error);
    });
  });

  describe('create', () => {
    it('should create a playlist with the correct data and return projected fields', async () => {
      mockCreate.mockResolvedValue(mockPlaylistSummary);

      const result = await repository.create(mockUserId, mockDto);

      expect(result).toEqual(mockPlaylistSummary);
      expect(mockCreate).toHaveBeenCalledWith({
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
      const dtoNoDesc: PlaylistDto = { name: 'Minimal' };
      const expected = {
        ...mockPlaylistSummary,
        name: 'Minimal',
        description: null,
      };
      mockCreate.mockResolvedValue(expected);

      const result = await repository.create(mockUserId, dtoNoDesc);

      expect(result).toEqual(expected);
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          name: 'Minimal',
          description: undefined,
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

    it('should propagate Prisma errors', async () => {
      const error = new Error('Unique constraint violation');
      mockCreate.mockRejectedValue(error);

      await expect(repository.create(mockUserId, mockDto)).rejects.toThrow(
        error,
      );
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
    it('should return the full playlist record when found', async () => {
      mockFindFirst.mockResolvedValue(mockPlaylistFull);

      const result = await repository.findOne(mockUserId, mockPlaylistId);

      expect(result).toEqual(mockPlaylistFull);
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { userId: mockUserId, id: mockPlaylistId },
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

      expect(mockDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({ userId: mockUserId }),
        }),
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
