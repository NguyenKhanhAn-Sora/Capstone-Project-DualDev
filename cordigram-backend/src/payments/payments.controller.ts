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

  @Post('ads/track')
  @UseGuards(JwtAuthGuard)
  async trackAdsEvent(
    @Req() req: Request,
    @Body()
    body: {
      promotedPostId?: string;
      renderedPostId?: string;
      eventType?: 'impression' | 'dwell' | 'cta_click';
      sessionId?: string;
      durationMs?: number;
      source?: string;
    },
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }

    if (!body?.promotedPostId || !body?.eventType || !body?.sessionId) {
      throw new BadRequestException('Missing promotedPostId, eventType, or sessionId');
    }

    if (!['impression', 'dwell', 'cta_click'].includes(body.eventType)) {
      throw new BadRequestException('Invalid eventType');
    }

    if (body.eventType === 'dwell') {
      if (typeof body.durationMs !== 'number' || !Number.isFinite(body.durationMs)) {
        throw new BadRequestException('durationMs is required for dwell event');
      }
      if (body.durationMs < 0) {
        throw new BadRequestException('durationMs must be >= 0');
      }
    }

    return this.paymentsService.trackAdsEvent(user.userId, {
      promotedPostId: body.promotedPostId,
      renderedPostId: body.renderedPostId,
      eventType: body.eventType,
      sessionId: body.sessionId,
      durationMs: body.durationMs,
      source: body.source,
    });
  }

  @Get('ads/dashboard')
  @UseGuards(JwtAuthGuard)
  async getAdsDashboard(@Req() req: Request) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.paymentsService.getAdsDashboard(user.userId);
  }

  @Get('ads/campaigns/:campaignId')
  @UseGuards(JwtAuthGuard)
  async getAdsCampaignDetail(
    @Req() req: Request,
    @Param('campaignId') campaignId: string,
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }

    return this.paymentsService.getAdsCampaignDetail(user.userId, campaignId);
  }

  @Post('ads/campaigns/:campaignId/action')
  @UseGuards(JwtAuthGuard)
  async performAdsCampaignAction(
    @Req() req: Request,
    @Param('campaignId') campaignId: string,
    @Body()
    body: {
      action?:
        | 'change_boost'
        | 'extend_days'
        | 'pause_campaign'
        | 'resume_campaign'
        | 'cancel_campaign'
        | 'update_details';
      boostPackageId?: string;
      extendDays?: number;
      campaignName?: string;
      objective?: string;
      adFormat?: string;
      primaryText?: string;
      headline?: string;
      adDescription?: string;
      destinationUrl?: string;
      cta?: string;
      interests?: string[];
      locationText?: string;
      ageMin?: number | null;
      ageMax?: number | null;
      placement?: string;
      mediaUrls?: string[];
    },
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new UnauthorizedException();
    }

    if (!body?.action) {
      throw new BadRequestException('Missing action');
    }

    const allowedActions = [
      'change_boost',
      'extend_days',
      'pause_campaign',
      'resume_campaign',
      'cancel_campaign',
      'update_details',
    ];
    if (!allowedActions.includes(body.action)) {
      throw new BadRequestException('Invalid action');
    }

    return this.paymentsService.performAdsCampaignAction(user.userId, campaignId, {
      action: body.action,
      boostPackageId: body.boostPackageId,
      extendDays: body.extendDays,
      campaignName: body.campaignName,
      objective: body.objective,
      adFormat: body.adFormat,
      primaryText: body.primaryText,
      headline: body.headline,
      adDescription: body.adDescription,
      destinationUrl: body.destinationUrl,
      cta: body.cta,
      interests: body.interests,
      locationText: body.locationText,
      ageMin: body.ageMin,
      ageMax: body.ageMax,
      placement: body.placement,
      mediaUrls: body.mediaUrls,
    });
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
