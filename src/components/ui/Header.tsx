import Image from "next/image"
import Logo from '../../../public/TSA_Logo_Primary_White_RGB 1.png'
import Link from "next/link"

const Header = () => {
  return (
    <header className="w-screen px-4 bg-[var(--color-bg-secondary)]">
        <Link href={'/'}>
            <Image src={Logo} alt={"tsa-logo"} height={64}/>
        </Link>
    </header>
  )
}

export default Header