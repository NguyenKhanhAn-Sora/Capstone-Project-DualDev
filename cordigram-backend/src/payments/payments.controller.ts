import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout-session')
  @UseGuards(JwtAuthGuard)
  async createCheckoutSession(
    @Req() req: Request,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.paymentsService.createCheckoutSession({
      userId: user.userId,
      email: user.email,
      dto,
    });
  }

  @Get('checkout-session/:sessionId')
  @UseGuards(JwtAuthGuard)
  async getCheckoutSessionStatus(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.paymentsService.getCheckoutSessionStatus(sessionId, user.userId);
  }

  @Get('me/ads-created')
  @UseGuards(JwtAuthGuard)
  async getMyAdsCreationStatus(@Req() req: Request) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.paymentsService.getMyAdsCreationStatus(user.userId);
  }

  @Post('webhook')
  @HttpCode(200)
  async handleStripeWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException(
        'Missing raw request body for Stripe webhook validation',
      );
    }

    const event = this.paymentsService.constructWebhookEvent(
      req.rawBody,
      signature,
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      await this.paymentsService.markCheckoutSessionCompleted(session);
      return {
        received: true,
        processed: true,
        sessionId: session.id,
        paymentStatus: session.payment_status,
      };
    }

    return { received: true, processed: false, eventType: event.type };
  }
}
