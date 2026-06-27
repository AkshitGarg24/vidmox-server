/**
 * @file Data Transfer Object for the Playlist entity.
 * Defines validation rules and Swagger metadata for
 * playlist create / update request payloads.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * PlaylistDto — request body shape for creating or updating a playlist.
 *
 * Fields:
 * - `name` (required, 3–100 chars)
 * - `description` (optional, max 500 chars)
 */
export class PlaylistDto {
  @ApiProperty({
    example: 'My Awesome Playlist',
    description: 'The name of the playlist',
    maxLength: 100,
    minLength: 3,
    required: true,
  })
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name cannot be empty' })
  @MinLength(3, { message: 'Name must be at least 3 characters long' })
  @MaxLength(100, { message: 'Name must be at most 100 characters long' })
  name!: string;

  @ApiPropertyOptional({
    example: 'A playlist of my favorite songs.',
    description: 'A brief description of the playlist',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, {
    message: 'Description must be at most 500 characters long',
  })
  description?: string;
}
