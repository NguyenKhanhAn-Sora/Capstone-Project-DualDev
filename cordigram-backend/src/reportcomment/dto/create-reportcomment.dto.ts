import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ReportCommentCategory,
  ReportCommentReasons,
} from '../reportcomment.schema';

export class CreateReportCommentDto {
  @IsIn(Object.keys(ReportCommentReasons))
  category: ReportCommentCategory;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
