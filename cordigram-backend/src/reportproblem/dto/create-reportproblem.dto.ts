import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateReportProblemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;
}
