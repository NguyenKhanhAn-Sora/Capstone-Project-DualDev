import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsOptional()
  @IsString()
  actionType?: string;

  @IsOptional()
  @IsString()
  targetCampaignId?: string;

  @IsInt()
  @Min(1000)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  campaignName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsOptional()
  @IsString()
  adFormat?: string;

  @IsString()
  @IsNotEmpty()
  boostPackageId!: string;

  @IsString()
  @IsNotEmpty()
  durationPackageId!: string;

  @IsOptional()
  @IsString()
  promotedPostId?: string;

  @IsOptional()
  @IsString()
  primaryText?: string;

  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  adDescription?: string;

  @IsOptional()
  @IsString()
  destinationUrl?: string;

  @IsOptional()
  @IsString()
  cta?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @IsOptional()
  @IsString()
  locationText?: string;

  @IsOptional()
  @IsInt()
  @Min(13)
  @Max(120)
  ageMin?: number;

  @IsOptional()
  @IsInt()
  @Min(13)
  @Max(120)
  ageMax?: number;

  @IsOptional()
  @IsString()
  placement?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];
}
