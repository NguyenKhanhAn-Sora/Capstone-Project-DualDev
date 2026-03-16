import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateCheckoutSessionDto {
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
}
