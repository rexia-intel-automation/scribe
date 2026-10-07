use std::{env, fs, io::Read, path::PathBuf, thread, time::Duration};

fn main() {
    assert_eq!(env::args().skip(1).collect::<Vec<_>>(), ["--show"]);
    let marker = PathBuf::from(env::var_os("SCRIBE_OPEN_TEST_MARKER").expect("Public test marker"));
    fs::write(&marker, std::process::id().to_string()).unwrap();
    let mut input = Vec::new();
    std::io::stdin().read_to_end(&mut input).unwrap();
    assert!(input.is_empty());
    println!("PUBLIC STDOUT SENTINEL");
    eprintln!("PUBLIC STDERR SENTINEL");
    fs::write(marker.with_extension("stdin"), "EOF").unwrap();
    thread::sleep(Duration::from_secs(10));
}
