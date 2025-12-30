import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ReportPostCategory, ReportPostReasons } from '../reportpost.schema';

export class CreateReportPostDto {
  @IsIn(Object.keys(ReportPostReasons))
  category: ReportPostCategory;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
