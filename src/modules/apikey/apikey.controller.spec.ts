import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyController } from './apikey.controller';
import { ApiKeysService } from './apikey.service';
import { ClerkAuthGuard } from 'src/guards/clerk.guard';
import { CanActivate, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

describe('ApiKeyController', () => {
  let controller: ApiKeyController;

  const createApiKey = jest.fn();
  const listApiKeys = jest.fn();
  const deleteApiKey = jest.fn();
  const getLastUsed = jest.fn();

  const mockApiKeysService = {
    createApiKey,
    listApiKeys,
    deleteApiKey,
    getLastUsed,
  };

  const mockRequest = {
    user: {
      id: 'test-user-id',
    },
  } as unknown as Request;

  // Mock ClerkAuthGuard to always allow access
  const mockClerkAuthGuard: CanActivate = {
    canActivate: jest.fn(() => true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeyController],
      providers: [
        {
          provide: ApiKeysService,
          useValue: mockApiKeysService,
        },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue(mockClerkAuthGuard)
      .compile();

    controller = module.get<ApiKeyController>(ApiKeyController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createApiKey', () => {
    it('should call apiKeysService.createApiKey with the user id', async () => {
      const result = { key: 'new-api-key' };
      mockApiKeysService.createApiKey.mockResolvedValue(result);

      await expect(controller.createApiKey(mockRequest)).resolves.toEqual(
        result,
      );
      expect(createApiKey).toHaveBeenCalledWith(mockRequest.user?.id);
      expect(createApiKey).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException if user is not authenticated', async () => {
      const req = { user: undefined } as unknown as Request;
      await expect(controller.createApiKey(req)).rejects.toThrow(
        new UnauthorizedException('User is not authenticated'),
      );
    });
  });

  describe('getAllApiKeys', () => {
    it('should call apiKeysService.listApiKeys with the user id', async () => {
      const result = [{ id: 'key1', prefix: 'VMX_...' }];
      mockApiKeysService.listApiKeys.mockResolvedValue(result);

      await expect(controller.getAllApiKeys(mockRequest)).resolves.toEqual(
        result,
      );
      expect(listApiKeys).toHaveBeenCalledWith(mockRequest.user?.id);
      expect(listApiKeys).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException if user is not authenticated', async () => {
      const req = { user: undefined } as unknown as Request;
      await expect(controller.getAllApiKeys(req)).rejects.toThrow(
        new UnauthorizedException('User is not authenticated'),
      );
    });
  });

  describe('deleteApiKey', () => {
    it('should call apiKeysService.deleteApiKey with user id and key id', async () => {
      const keyId = 'key-to-delete';
      mockApiKeysService.deleteApiKey.mockResolvedValue(undefined);

      await expect(
        controller.deleteApiKey(mockRequest, keyId),
      ).resolves.toBeUndefined();
      expect(deleteApiKey).toHaveBeenCalledWith(mockRequest.user?.id, keyId);
      expect(deleteApiKey).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException if user is not authenticated', async () => {
      const req = { user: undefined } as unknown as Request;
      const keyId = 'key-to-delete';
      await expect(controller.deleteApiKey(req, keyId)).rejects.toThrow(
        new UnauthorizedException('User is not authenticated'),
      );
    });
  });

  describe('getLastUsed', () => {
    it('should call apiKeysService.getLastUsed with user id and key id', async () => {
      const keyId = 'key-to-check';
      const lastUsedDate = new Date();
      const result = { lastUsedAt: lastUsedDate };
      mockApiKeysService.getLastUsed.mockResolvedValue(result);

      await expect(controller.getLastUsed(mockRequest, keyId)).resolves.toEqual(
        result,
      );
      expect(getLastUsed).toHaveBeenCalledWith(mockRequest.user?.id, keyId);
      expect(getLastUsed).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException if user is not authenticated', async () => {
      const req = { user: undefined } as unknown as Request;
      const keyId = 'key-to-check';
      await expect(controller.getLastUsed(req, keyId)).rejects.toThrow(
        new UnauthorizedException('User is not authenticated'),
      );
    });
  });
});
