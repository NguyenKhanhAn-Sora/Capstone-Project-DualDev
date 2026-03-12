import {
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedUser } from './jwt.strategy';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	constructor() {
		super();
	}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const activated = (await super.canActivate(context)) as boolean;
		if (!activated) return false;

		const request = context.switchToHttp().getRequest<{
			method?: string;
			originalUrl?: string;
			url?: string;
			user?: AuthenticatedUser;
		}>();

		const authUser = request.user;
		if (!authUser?.userId) return true;

		if ((authUser.roles ?? []).includes('admin')) {
			return true;
		}

		if (authUser.status === 'banned') {
			throw new ForbiddenException('Account is suspended.');
		}

		const isLimited =
			authUser.status === 'pending' &&
			authUser.signupStage === 'completed' &&
			(Boolean(authUser.accountLimitedIndefinitely) ||
				authUser.accountLimitedUntil instanceof Date);

		if (!isLimited) {
			return true;
		}

		const method = String(request.method ?? 'GET').toUpperCase();
		const path = String(request.originalUrl ?? request.url ?? '').split('?')[0];

		if (this.isAllowedForLimitedAccount(method, path)) {
			return true;
		}

		throw new ForbiddenException('Your account is limited to read-only mode.');
	}

	private isAllowedForLimitedAccount(method: string, path: string): boolean {
		if (path.startsWith('/direct-messages')) {
			return true;
		}

		if (/^\/channels\/[^/]+\/messages(?:\/.*)?$/.test(path)) {
			return true;
		}

		if (method === 'GET') {
			return true;
		}

		if (
			method === 'POST' &&
			(/^\/posts\/[^/]+\/view$/.test(path) ||
				/^\/reels\/[^/]+\/view$/.test(path))
		) {
			return true;
		}

		return false;
	}
}
