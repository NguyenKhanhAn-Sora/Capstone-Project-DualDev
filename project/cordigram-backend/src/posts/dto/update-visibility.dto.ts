import { IsEnum } from 'class-validator';
import { Visibility } from '../post.schema';

export class UpdateVisibilityDto {
  @IsEnum(['public', 'followers', 'private'])
  visibility!: Visibility;
}
