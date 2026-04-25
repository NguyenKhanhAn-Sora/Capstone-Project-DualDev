import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsOptional()
  @IsString()
  actionType?: string;

  /** For boost checkout flow */
  @IsOptional()
  @IsString()
  boostTier?: string; // 'basic' | 'boost'

  /** For boost checkout flow */
  @IsOptional()
  @IsString()
  billingCycle?: string; // 'monthly' | 'yearly'

  /** For boost gift flow */
  @IsOptional()
  @IsString()
  recipientUserId?: string;

  @IsOptional()
  @IsString()
  targetCampaignId?: string;

  @ValidateIf(
    (o) => !['boost_subscribe', 'boost_gift'].includes(String(o.actionType)),
  )
  @IsInt()
  @Min(1000)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  successUrl?: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string;

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

  @ValidateIf(
    (o) => !['boost_subscribe', 'boost_gift'].includes(String(o.actionType)),
  )
  @IsString()
  @IsNotEmpty()
  boostPackageId!: string;

  @ValidateIf(
    (o) => !['boost_subscribe', 'boost_gift'].includes(String(o.actionType)),
  )
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
