import { Link } from 'react-router-dom';
import LogoIcon from '../../assets/lov-analytics-logo.svg';

export function NavLogo() {
    return (
        <Link to="/" draggable="false" className="flex w-full min-w-0 items-center gap-2 text-xl font-semibold text-gray-900 dark:text-base-content">
            <div className="relative flex items-center justify-center">
                <img
                    src={LogoIcon}
                    alt="lov-analytics"
                    className="w-8 h-8 cursor-pointer active:scale-95 transition-transform relative z-10"
                    draggable="false"
                />
            </div>

            {/* 父容器宽度 < 200px 隐藏 */}
            <span className="hidden @[200px]/logo:inline text-nowrap">lov-analytics</span>
        </Link>
    );
}
