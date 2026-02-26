import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { ReportProblemController } from './reportproblem.controller';
import { ReportProblemService } from './reportproblem.service';
import { ReportProblem, ReportProblemSchema } from './reportproblem.schema';

@Module({
  imports: [
    AuthModule,
    CloudinaryModule,
    MongooseModule.forFeature([
      { name: ReportProblem.name, schema: ReportProblemSchema },
    ]),
  ],
  controllers: [ReportProblemController],
  providers: [ReportProblemService],
  exports: [ReportProblemService],
})
export class ReportProblemModule {}
