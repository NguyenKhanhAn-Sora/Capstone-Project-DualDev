import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportUserCategory, ReportUserReasons } from '../reportuser.schema';

export class CreateReportUserDto {
  @IsIn(Object.keys(ReportUserReasons))
  category: ReportUserCategory;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
