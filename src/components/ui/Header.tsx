import Image from "next/image"
import Logo from '../../../public/prism-logo-bg-removed.png'
import Link from "next/link"

const Header = () => {
  return (
    <header className="w-screen px-4 bg-[var(--color-bg-secondary)]">
        <Link href={'/'} className="flex items-center gap-x-4 text-[var(--color-text-primary)]">
            <Image src={Logo} alt={"tsa-logo"} height={64}/> <span className="text-lg tracking-wide">PRISM</span>
        </Link>
    </header>
  )
}

export default Header