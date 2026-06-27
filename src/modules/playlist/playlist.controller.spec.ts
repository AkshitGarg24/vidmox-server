import { Test, TestingModule } from '@nestjs/testing';
import { PlaylistController } from './playlist.controller';
import { PlaylistService } from './playlist.service';
import { ClerkAuthGuard } from 'src/guards/clerk.guard';
import { CanActivate, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PlaylistDto } from './dto/playlist.dto';

describe('PlaylistController', () => {
  let controller: PlaylistController;

  const create = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const update = jest.fn();
  const deleteFn = jest.fn();

  const mockPlaylistService = {
    create,
    findAll,
    findOne,
    update,
    delete: deleteFn,
  };

  const mockRequest = {
    user: { id: 'test-user-id' },
  } as unknown as Request;

  const mockClerkAuthGuard: CanActivate = {
    canActivate: jest.fn(() => true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlaylistController],
      providers: [
        {
          provide: PlaylistService,
          useValue: mockPlaylistService,
        },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue(mockClerkAuthGuard)
      .compile();

    controller = module.get<PlaylistController>(PlaylistController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const dto: PlaylistDto = {
      name: 'New Playlist',
      description: 'A description',
    };

    it('should call playlistService.create with user id and dto', async () => {
      const result = {
        id: 'new-id',
        name: 'New Playlist',
        description: 'A description',
        totalVideos: 0,
        createdAt: new Date(),
      };
      mockPlaylistService.create.mockResolvedValue(result);

      await expect(controller.create(mockRequest, dto)).resolves.toEqual(
        result,
      );
      expect(create).toHaveBeenCalledWith(mockRequest.user?.id, dto);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException if user is not authenticated', async () => {
      const req = { user: undefined } as unknown as Request;
      await expect(controller.create(req, dto)).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );
    });
  });

  describe('findAll', () => {
    it('should call playlistService.findAll with user id', async () => {
      const result = [
        {
          id: 'pl-1',
          name: 'Playlist',
          description: null,
          totalVideos: 0,
          createdAt: new Date(),
        },
      ];
      mockPlaylistService.findAll.mockResolvedValue(result);

      await expect(controller.findAll(mockRequest)).resolves.toEqual(result);
      expect(findAll).toHaveBeenCalledWith(mockRequest.user?.id);
      expect(findAll).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException if user is not authenticated', async () => {
      const req = { user: undefined } as unknown as Request;
      await expect(controller.findAll(req)).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );
    });
  });

  describe('findOne', () => {
    const playlistId = 'playlist-id-123';

    it('should call playlistService.findOne with user id and playlist id', async () => {
      const result = {
        id: playlistId,
        name: 'My Playlist',
        description: 'Desc',
        totalVideos: 3,
        createdAt: new Date(),
      };
      mockPlaylistService.findOne.mockResolvedValue(result);

      await expect(
        controller.findOne(mockRequest, playlistId),
      ).resolves.toEqual(result);
      expect(findOne).toHaveBeenCalledWith(mockRequest.user?.id, playlistId);
      expect(findOne).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException if user is not authenticated', async () => {
      const req = { user: undefined } as unknown as Request;
      await expect(controller.findOne(req, playlistId)).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );
    });
  });

  describe('update', () => {
    const playlistId = 'playlist-id-123';
    const dto: PlaylistDto = { name: 'Updated Name' };

    it('should call playlistService.update with user id, playlist id, and dto', async () => {
      const result = {
        id: playlistId,
        name: 'Updated Name',
        description: null,
        totalVideos: 0,
        createdAt: new Date(),
      };
      mockPlaylistService.update.mockResolvedValue(result);

      await expect(
        controller.update(mockRequest, playlistId, dto),
      ).resolves.toEqual(result);
      expect(update).toHaveBeenCalledWith(
        mockRequest.user?.id,
        playlistId,
        dto,
      );
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException if user is not authenticated', async () => {
      const req = { user: undefined } as unknown as Request;
      await expect(controller.update(req, playlistId, dto)).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );
    });
  });

  describe('delete', () => {
    const playlistId = 'playlist-id-123';

    it('should call playlistService.delete with user id and playlist id', async () => {
      const result = {
        id: playlistId,
        name: 'To Delete',
        description: null,
        totalVideos: 0,
        createdAt: new Date(),
      };
      mockPlaylistService.delete.mockResolvedValue(result);

      await expect(controller.delete(mockRequest, playlistId)).resolves.toEqual(
        result,
      );
      expect(deleteFn).toHaveBeenCalledWith(mockRequest.user?.id, playlistId);
      expect(deleteFn).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException if user is not authenticated', async () => {
      const req = { user: undefined } as unknown as Request;
      await expect(controller.delete(req, playlistId)).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );
    });
  });
});
