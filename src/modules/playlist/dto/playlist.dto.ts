/**
 * @file Data Transfer Object for the Playlist entity.
 * Defines validation rules and Swagger metadata for
 * playlist create / update request payloads.
 */
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * PlaylistDto — request body shape for creating or updating a playlist.
 *
 * Fields:
 * - `name` (required, 3–100 chars, trimmed and whitespace-collapsed)
 * - `description` (optional, max 500 chars, trimmed and whitespace-collapsed)
 */
export class PlaylistDto {
  @ApiProperty({
    example: 'My Awesome Playlist',
    description: 'The name of the playlist',
    maxLength: 100,
    minLength: 3,
    required: true,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name cannot be empty' })
  @MinLength(3, { message: 'Name must be at least 3 characters long' })
  @MaxLength(100, { message: 'Name must be at most 100 characters long' })
  @Matches(/\S/, {
    message: 'Name must contain at least one non-whitespace character',
  })
  name!: string;

  @ApiPropertyOptional({
    example: 'A playlist of my favorite songs.',
    description: 'A brief description of the playlist',
    required: false,
    maxLength: 500,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? (() => {
          const s = value.trim().replace(/\s+/g, ' ');
          return s || undefined;
        })()
      : value,
  )
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, {
    message: 'Description must be at most 500 characters long',
  })
  description?: string;
}
